package com.abdelghany.tazkeer.adhan;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.hardware.GeomagneticField;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;
import android.view.Display;
import android.view.Surface;
import android.view.WindowManager;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import android.app.Activity;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.abdelghany.tazkeer.MainActivity;
import com.abdelghany.tazkeer.R;
import com.abdelghany.tazkeer.widget.TazkeerPrayerWidget;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONException;

/**
 * ============================================================================
 * AdhanSchedulerPlugin — Capacitor bridge for the native Adhan engine.
 * ============================================================================
 *
 * JavaScript API (registered as `AdhanScheduler`):
 *
 *   scheduleAlarms({ alarms: [...] })       -> replace the 7-day native schedule
 *   cancelAllAlarms()                       -> cancel all prayer alarms
 *   stopPlayback()                          -> instantly stop a playing adhan
 *   checkPermissions()                      -> notification / exact / battery status
 *   requestNotificationPermission()         -> Android 13 runtime prompt
 *   requestExactAlarmPermission()           -> "Alarms & reminders" settings page
 *   requestBatteryOptimizationExemption()   -> battery optimization dialog
 *   testAdhan({ delaySeconds, soundRes })   -> one-off test without wiping schedule
 *   getScheduledAlarms()                    -> persisted future alarms
 *   openAppSettings()                       -> app details page
 */
@CapacitorPlugin(
        name = "AdhanScheduler",
        permissions = {
                @Permission(
                        alias = "notifications",
                        strings = {Manifest.permission.POST_NOTIFICATIONS}
                )
        }
)
public class AdhanSchedulerPlugin extends Plugin {

    private static final String TAG = "TazkeerAdhan";
    private static final Pattern SOUND_ID_PATTERN = Pattern.compile("^[a-z0-9_]{1,40}$");
    private static final long MAX_DOWNLOAD_BYTES = 15L * 1024L * 1024L;
    private static final int MAX_REDIRECT_HOPS = 3;
    private static final String[] TRUSTED_DOWNLOAD_HOSTS = new String[] {
            "archive.org",
            "cdn.islamic.network",
            "raw.githubusercontent.com",
            "cdn.jsdelivr.net"
    };

    private static final String[] TRUSTED_EXTERNAL_HOSTS = new String[] {
            "github.com",
            "abdelghany-77.github.io",
            "objects.githubusercontent.com",
            "release-assets.githubusercontent.com",
            "play.google.com"
    };

    private final ExecutorService downloadExecutor = Executors.newFixedThreadPool(2);

    private static boolean isValidSoundId(String sound) {
        return sound != null && SOUND_ID_PATTERN.matcher(sound).matches();
    }

    private static boolean isTrustedDownloadUrl(URL url) {
        if (url == null) return false;
        String protocol = url.getProtocol();
        if (protocol == null || !"https".equalsIgnoreCase(protocol)) {
            return false;
        }
        String host = url.getHost();
        if (host == null || host.isEmpty()) {
            return false;
        }
        String lowerHost = host.toLowerCase(Locale.US);
        for (String allowed : TRUSTED_DOWNLOAD_HOSTS) {
            if (lowerHost.equals(allowed) || lowerHost.endsWith("." + allowed)) {
                return true;
            }
        }
        return false;
    }

    // ------------------------------------------------------------------------
    // Scheduling
    // ------------------------------------------------------------------------

    @PluginMethod
    public void scheduleAlarms(PluginCall call) {
        JSArray alarms = call.getArray("alarms");
        if (alarms == null) {
            call.reject("alarms array is required");
            return;
        }

        try {
            JSONArray nativeAlarms = new JSONArray(alarms.toString());
            int scheduled = AdhanAlarmManager.scheduleAll(getContext(), nativeAlarms);

            JSObject result = buildStatus();
            result.put("scheduled", scheduled);
            result.put("requested", nativeAlarms.length());
            call.resolve(result);
        } catch (JSONException e) {
            Log.e(TAG, "Invalid alarms payload", e);
            call.reject("Invalid alarms payload: " + e.getMessage());
        }
    }

    @PluginMethod
    public void cancelAllAlarms(PluginCall call) {
        AdhanAlarmManager.cancelAll(getContext());
        JSObject result = buildStatus();
        result.put("cancelled", true);
        call.resolve(result);
    }

    @PluginMethod
    public void stopPlayback(PluginCall call) {
        AdhanPlaybackService.stop(getContext());
        JSObject result = new JSObject();
        result.put("stopped", true);
        call.resolve(result);
    }

    @PluginMethod
    public void setVolume(PluginCall call) {
        Double volumeValue = call.getDouble("volume");
        if (volumeValue != null) {
            AdhanPlaybackService.updateVolume(getContext(), volumeValue.floatValue());
        }
        JSObject result = new JSObject();
        result.put("updated", true);
        call.resolve(result);
    }

    @PluginMethod
    public void setVolumeStopEnabled(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled", true);
        boolean val = enabled == null || enabled;
        AdhanPlaybackService.setVolumeStopEnabled(getContext(), val);
        JSObject result = new JSObject();
        result.put("volumeStopEnabled", val);
        call.resolve(result);
    }

    @PluginMethod
    public void updateWidgetData(PluginCall call) {
        String city = call.getString("city", "");
        String dhikr = call.getString("dhikr", "");
        JSArray prayers = call.getArray("prayers");
        try {
            JSONArray nativePrayers = prayers != null ? new JSONArray(prayers.toString()) : null;
            TazkeerPrayerWidget.saveWidgetData(getContext(), city, nativePrayers, dhikr);
            JSObject result = new JSObject();
            result.put("updated", true);
            call.resolve(result);
        } catch (JSONException e) {
            Log.w(TAG, "Invalid widget prayer payload", e);
            call.reject("Invalid widget prayer payload");
        }
    }

    @PluginMethod
    public void openExternalUrl(PluginCall call) {
        String rawUrl = call.getString("url", "");
        if (rawUrl == null || rawUrl.trim().isEmpty()) {
            call.reject("URL is required");
            return;
        }
        try {
            URL parsed = new URL(rawUrl.trim());
            if (!"https".equalsIgnoreCase(parsed.getProtocol())) {
                call.reject("Only HTTPS URLs are allowed");
                return;
            }
            String host = parsed.getHost() == null ? "" : parsed.getHost().toLowerCase(Locale.US);
            boolean trusted = false;
            for (String allowed : TRUSTED_EXTERNAL_HOSTS) {
                if (host.equals(allowed) || host.endsWith("." + allowed)) {
                    trusted = true;
                    break;
                }
            }
            if (!trusted) {
                call.reject("Untrusted update host");
                return;
            }
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(parsed.toString()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject res = new JSObject();
            res.put("opened", true);
            call.resolve(res);
        } catch (Exception e) {
            Log.w(TAG, "Could not open external URL", e);
            call.reject("Failed to open URL");
        }
    }

    @PluginMethod
    public void testAdhan(PluginCall call) {
        Integer delay = call.getInt("delaySeconds", 10);
        int delaySeconds = delay == null ? 10 : delay;
        if (delaySeconds < 1) {
            delaySeconds = 1;
        }

        String sound = call.getString("soundRes", "adhan_abdulbasit");
        String prayer = call.getString("prayer", "تجربة");
        Double volumeValue = call.getDouble("volume");
        float volume = volumeValue == null ? 1.0f : volumeValue.floatValue();
        boolean isFajr = "adhan_fajr".equals(sound);

        long triggerAt = System.currentTimeMillis() + (delaySeconds * 1000L);
        boolean scheduled = AdhanAlarmManager.scheduleTest(
                getContext(),
                triggerAt,
                prayer,
                "تجربة الأذان",
                sound,
                isFajr,
                volume
        );

        JSObject result = buildStatus();
        result.put("scheduled", scheduled);
        result.put("triggerAt", triggerAt);
        result.put("delaySeconds", delaySeconds);
        result.put("exactAlarms", AdhanAlarmManager.canScheduleExactAlarms(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void isMuezzinDownloaded(PluginCall call) {
        String sound = call.getString("sound");
        if (!isValidSoundId(sound)) {
            call.reject("Invalid sound identifier");
            return;
        }
        File file = new File(getContext().getFilesDir(), sound + ".mp3");
        boolean exists = file.exists() && file.length() > 50000;
        JSObject result = new JSObject();
        result.put("downloaded", exists);
        result.put("sound", sound);
        call.resolve(result);
    }

    @PluginMethod
    public void downloadMuezzin(PluginCall call) {
        String sound = call.getString("sound");
        String urlString = call.getString("url");
        if (!isValidSoundId(sound) || urlString == null || urlString.trim().isEmpty()) {
            call.reject("Valid sound identifier and HTTPS url are required");
            return;
        }

        final URL initialUrl;
        try {
            initialUrl = new URL(urlString.trim());
        } catch (Exception e) {
            call.reject("Invalid URL format");
            return;
        }

        if (!isTrustedDownloadUrl(initialUrl)) {
            call.reject("Untrusted or non-HTTPS download URL");
            return;
        }

        if (downloadExecutor.isShutdown()) {
            call.reject("Downloader unavailable");
            return;
        }

        final Context appContext = getContext().getApplicationContext();
        downloadExecutor.execute(() -> {
            File targetFile = new File(appContext.getFilesDir(), sound + ".mp3");
            File tempFile = new File(appContext.getFilesDir(), sound + ".tmp");
            HttpURLConnection conn = null;
            InputStream in = null;
            FileOutputStream out = null;
            try {
                URL currentUrl = initialUrl;
                int responseCode = -1;

                for (int hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
                    if (!isTrustedDownloadUrl(currentUrl)) {
                        throw new IOException("Redirect target is not a trusted HTTPS host");
                    }
                    conn = (HttpURLConnection) currentUrl.openConnection();
                    conn.setConnectTimeout(15000);
                    conn.setReadTimeout(30000);
                    conn.setInstanceFollowRedirects(false);
                    conn.setRequestProperty("User-Agent", "Tazkeer-App/2.2");
                    conn.connect();

                    responseCode = conn.getResponseCode();
                    if (responseCode == HttpURLConnection.HTTP_MOVED_PERM
                            || responseCode == HttpURLConnection.HTTP_MOVED_TEMP
                            || responseCode == HttpURLConnection.HTTP_SEE_OTHER
                            || responseCode == 307
                            || responseCode == 308) {
                        String location = conn.getHeaderField("Location");
                        conn.disconnect();
                        conn = null;
                        if (location == null || location.trim().isEmpty()) {
                            throw new IOException("Redirect missing Location header");
                        }
                        currentUrl = new URL(currentUrl, location.trim());
                        continue;
                    }
                    break;
                }

                if (conn == null || responseCode != HttpURLConnection.HTTP_OK) {
                    throw new IOException("HTTP error code: " + responseCode);
                }

                long expectedLength = conn.getContentLengthLong();
                if (expectedLength > MAX_DOWNLOAD_BYTES) {
                    throw new IOException("Audio file exceeds maximum allowed size");
                }

                in = conn.getInputStream();
                out = new FileOutputStream(tempFile);
                byte[] buffer = new byte[8192];
                int bytesRead;
                long totalBytes = 0L;
                long lastProgressMs = 0L;
                int lastPercent = -1;
                while ((bytesRead = in.read(buffer)) != -1) {
                    totalBytes += bytesRead;
                    if (totalBytes > MAX_DOWNLOAD_BYTES) {
                        throw new IOException("Audio file exceeds maximum allowed size");
                    }
                    out.write(buffer, 0, bytesRead);

                    long nowMs = System.currentTimeMillis();
                    int percent = expectedLength > 0L
                            ? (int) Math.min(99L, (totalBytes * 100L) / expectedLength)
                            : -1;
                    if (nowMs - lastProgressMs >= 160L || (percent >= 0 && percent >= lastPercent + 5)) {
                        lastProgressMs = nowMs;
                        if (percent >= 0) lastPercent = percent;
                        JSObject prog = new JSObject();
                        prog.put("sound", sound);
                        prog.put("downloadedBytes", totalBytes);
                        prog.put("totalBytes", expectedLength);
                        prog.put("percent", percent);
                        notifyListeners("adhanDownloadProgress", prog);
                    }
                }
                out.flush();
                out.close();
                out = null;
                in.close();
                in = null;

                if (tempFile.length() < 50L * 1024L) {
                    tempFile.delete();
                    throw new IOException("Downloaded file is too small or corrupt");
                }
                if (expectedLength > 0L && tempFile.length() != expectedLength) {
                    tempFile.delete();
                    throw new IOException("Downloaded audio byte length mismatch");
                }
                if (!hasValidMp3Header(tempFile)) {
                    tempFile.delete();
                    throw new IOException("Downloaded file is not a valid MP3 audio stream");
                }

                if (targetFile.exists()) {
                    targetFile.delete();
                }
                if (!tempFile.renameTo(targetFile)) {
                    throw new IOException("Failed to save audio file");
                }

                JSObject doneProg = new JSObject();
                doneProg.put("sound", sound);
                doneProg.put("downloadedBytes", targetFile.length());
                doneProg.put("totalBytes", targetFile.length());
                doneProg.put("percent", 100);
                notifyListeners("adhanDownloadProgress", doneProg);

                JSObject res = new JSObject();
                res.put("success", true);
                res.put("sound", sound);
                res.put("size", targetFile.length());
                call.resolve(res);
            } catch (Exception e) {
                Log.e(TAG, "Failed to download muezzin audio: " + sound, e);
                if (tempFile.exists()) {
                    tempFile.delete();
                }
                call.reject("Download failed: " + e.getMessage());
            } finally {
                try {
                    if (in != null) in.close();
                } catch (Exception ignored) {}
                try {
                    if (out != null) out.close();
                } catch (Exception ignored) {}
                if (conn != null) {
                    try {
                        conn.disconnect();
                    } catch (Exception ignored) {}
                }
            }
        });
    }

    @PluginMethod
    public void deleteMuezzin(PluginCall call) {
        String sound = call.getString("sound");
        if (!isValidSoundId(sound)) {
            call.reject("Invalid sound identifier");
            return;
        }
        File targetFile = new File(getContext().getFilesDir(), sound + ".mp3");
        boolean deleted = false;
        if (targetFile.exists()) {
            deleted = targetFile.delete();
        }
        JSObject res = new JSObject();
        res.put("deleted", deleted);
        call.resolve(res);
    }

    @PluginMethod
    public void getScheduledAlarms(PluginCall call) {
        JSONArray alarms = AdhanAlarmManager.getFutureAlarms(getContext());
        JSObject result = new JSObject();
        result.put("alarms", alarms);
        result.put("count", alarms.length());
        result.put("exactAlarms", AdhanAlarmManager.canScheduleExactAlarms(getContext()));
        call.resolve(result);
    }

    // ------------------------------------------------------------------------
    // Permissions & diagnostics
    // ------------------------------------------------------------------------

    /**
     * Returns the three permission badges shown in the in-app diagnostics UI.
     * This intentionally overrides Capacitor's default permission map so the
     * JS layer gets a single, stable, app-specific payload.
     */
    @Override
    @PluginMethod
    public void checkPermissions(PluginCall call) {
        call.resolve(buildStatus());
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            // Notification channels are always enabled before Android 13.
            call.resolve(buildStatus());
            return;
        }
        if (ContextCompat.checkSelfPermission(
                getContext(),
                Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED) {
            call.resolve(buildStatus());
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        call.resolve(buildStatus());
    }

    @PluginMethod
    public void requestExactAlarmPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S
                || AdhanAlarmManager.canScheduleExactAlarms(getContext())) {
            call.resolve(buildStatus());
            return;
        }

        try {
            Intent intent = new Intent(
                    Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                    Uri.parse("package:" + getContext().getPackageName())
            );
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        } catch (ActivityNotFoundException e) {
            Log.w(TAG, "Exact alarm settings screen missing, opening app details", e);
            openAppDetails();
        } catch (Exception e) {
            Log.e(TAG, "Could not open exact alarm settings", e);
        }

        JSObject result = buildStatus();
        result.put("settingsOpened", true);
        call.resolve(result);
    }

    @SuppressLint("BatteryLife")
    @PluginMethod
    public void requestBatteryOptimizationExemption(PluginCall call) {
        Context context = getContext();

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            call.resolve(buildStatus());
            return;
        }

        PowerManager powerManager =
                (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        if (powerManager != null
                && powerManager.isIgnoringBatteryOptimizations(context.getPackageName())) {
            call.resolve(buildStatus());
            return;
        }

        // Open the standard system Battery Optimization settings page (no restricted
        // REQUEST_IGNORE_BATTERY_OPTIMIZATIONS manifest permission required on Google Play).
        try {
            Intent intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
        } catch (ActivityNotFoundException e) {
            openAppDetails();
        } catch (Exception e) {
            Log.e(TAG, "Could not open battery optimization settings", e);
            openAppDetails();
        }

        JSObject result = buildStatus();
        result.put("settingsOpened", true);
        call.resolve(result);
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        openAppDetails();
        JSObject result = new JSObject();
        result.put("opened", true);
        call.resolve(result);
    }

    // ------------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------------

    private JSObject buildStatus() {
        Context context = getContext();

        boolean notificationsEnabled =
                NotificationManagerCompat.from(context).areNotificationsEnabled();

        boolean notificationRuntimeGranted = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            notificationRuntimeGranted = ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED;
        }

        boolean exactAlarms = AdhanAlarmManager.canScheduleExactAlarms(context);

        boolean batteryExempt = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager powerManager =
                    (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            batteryExempt = powerManager != null
                    && powerManager.isIgnoringBatteryOptimizations(context.getPackageName());
        } else {
            batteryExempt = true;
        }

        AlarmManager alarmManager =
                (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        boolean hasUseExactAlarm = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // canScheduleExactAlarms() is the authoritative check; the flag
            // below is informational for the diagnostics UI.
            hasUseExactAlarm = exactAlarms;
        } else if (alarmManager != null) {
            hasUseExactAlarm = true;
        }

        JSObject status = new JSObject();
        status.put("native", true);
        status.put("sdkInt", Build.VERSION.SDK_INT);

        // Three primary badges consumed by the UI
        status.put("notifications", notificationsEnabled);
        status.put("exactAlarms", exactAlarms);
        status.put("batteryOptimizations", batteryExempt);

        // Extra detail for troubleshooting
        status.put("notificationRuntimePermission", notificationRuntimeGranted);
        status.put("useExactAlarmGranted", hasUseExactAlarm);
        status.put("canScheduleExactAlarms", exactAlarms);
        status.put("ignoringBatteryOptimizations", batteryExempt);
        status.put(
                "batteryOptimizationMode",
                batteryExempt ? "unrestricted" : "optimized"
        );
        status.put("volumeStopEnabled", AdhanPlaybackService.isVolumeStopEnabled(context));
        return status;
    }

    private void openAppDetails() {
        try {
            Intent intent = new Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + getContext().getPackageName())
            );
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        } catch (Exception e) {
            Log.e(TAG, "Could not open app settings", e);
        }
    }

    // ========================================================================
    // Azkar Notification & Sound System
    // ========================================================================

    public static final String AZKAR_CHANNEL_ID = "azkar_reminders";

    private void ensureAzkarChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager =
                    (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager == null) return;
            NotificationChannel existing = manager.getNotificationChannel(AZKAR_CHANNEL_ID);
            if (existing == null) {
                NotificationChannel channel = new NotificationChannel(
                        AZKAR_CHANNEL_ID,
                        "تذكير الأذكار اليومية",
                        NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("إشعارات تذكير أذكار الصباح والمساء والنوم والجمعة");
                channel.enableVibration(true);
                channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
                AudioAttributes audioAttributes = new AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .build();
                channel.setSound(soundUri, audioAttributes);
                manager.createNotificationChannel(channel);
            }
        }
    }

    @PluginMethod
    public void sendAzkarNotification(PluginCall call) {
        String title = call.getString("title", "تذكير الأذكار");
        String body = call.getString("body", "");
        String section = call.getString("section", "tab-azkar");
        if (section == null || section.trim().isEmpty()) {
            section = "tab-azkar";
        }
        ensureAzkarChannel();

        Context context = getContext();
        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) {
            call.reject("NotificationManager unavailable");
            return;
        }

        String cleanSection = section.trim();
        int fallbackId = 99000 + Math.abs(cleanSection.hashCode() % 900);
        int notifId = call.getInt("id", fallbackId);
        String deepLink = "tazkeer://open/" + cleanSection;
        Intent intent = new Intent(
                Intent.ACTION_VIEW,
                Uri.parse(deepLink),
                context,
                MainActivity.class
        );
        intent.putExtra("tazkeer_deep_link", deepLink);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pendingIntent = PendingIntent.getActivity(context, notifId, intent, flags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, AZKAR_CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_adhan)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent);

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            builder.setSound(soundUri).setDefaults(NotificationCompat.DEFAULT_VIBRATE);
        }

        manager.notify(notifId, builder.build());

        JSObject res = new JSObject();
        res.put("success", true);
        call.resolve(res);
    }

    @PluginMethod
    public void scheduleAzkarReminders(PluginCall call) {
        JSArray reminders = call.getArray("reminders");
        if (reminders == null) {
            call.reject("reminders array is required");
            return;
        }
        try {
            ensureAzkarChannel();
            int scheduled = AdhkarAlarmManager.scheduleAll(
                    getContext(), new JSONArray(reminders.toString())
            );
            if (scheduled < 0) {
                call.reject("Invalid adhkar replacement schedule");
                return;
            }
            JSObject result = new JSObject();
            result.put("scheduled", scheduled);
            result.put("requested", reminders.length());
            result.put("exactAlarms", AdhanAlarmManager.canScheduleExactAlarms(getContext()));
            call.resolve(result);
        } catch (JSONException error) {
            Log.e(TAG, "Invalid adhkar reminders payload", error);
            call.reject("Invalid adhkar reminders payload: " + error.getMessage());
        }
    }

    @PluginMethod
    public void cancelAzkarReminders(PluginCall call) {
        AdhkarAlarmManager.cancelAll(getContext());
        JSObject result = new JSObject();
        result.put("cancelled", true);
        call.resolve(result);
    }

    @PluginMethod
    public void playNotificationSound(PluginCall call) {
        playNotificationTone();
        JSObject res = new JSObject();
        res.put("played", true);
        call.resolve(res);
    }

    private void playNotificationTone() {
        try {
            Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            Ringtone r = RingtoneManager.getRingtone(getContext(), soundUri);
            if (r != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    AudioAttributes aa = new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build();
                    r.setAudioAttributes(aa);
                }
                r.play();
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed playing notification tone", e);
        }
    }

    // ========================================================================
    // Native Hardware Qibla Compass (Tilt-compensated, Smoothed, True North)
    // ========================================================================

    private static final float COMPASS_SMOOTH_ALPHA = 0.22f;

    private SensorManager sensorManager;
    private Sensor rotationSensor;
    private Sensor accelerometer;
    private Sensor magnetometer;
    private final float[] lastAccelerometer = new float[3];
    private final float[] lastMagnetometer = new float[3];
    private boolean lastAccelerometerSet = false;
    private boolean lastMagnetometerSet = false;
    private final float[] rMatrix = new float[9];
    private final float[] remappedMatrix = new float[9];
    private final float[] orientationValues = new float[3];
    private long lastCompassUpdate = 0;
    private boolean isCompassListening = false;
    private boolean compassRequested = false;
    private float compassDeclination = 0f;
    private double smoothedSin = 0.0;
    private double smoothedCos = 0.0;
    private boolean hasSmoothedHeading = false;

    private int getDisplayRotation() {
        try {
            if (getActivity() != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                Display display = getActivity().getDisplay();
                if (display != null) {
                    return display.getRotation();
                }
            }
            WindowManager wm = (WindowManager) getContext().getSystemService(Context.WINDOW_SERVICE);
            if (wm != null) {
                @SuppressWarnings("deprecation")
                Display display = wm.getDefaultDisplay();
                if (display != null) {
                    return display.getRotation();
                }
            }
        } catch (Exception ignored) {
        }
        return Surface.ROTATION_0;
    }

    private float computeTiltCompensatedAzimuth(float[] rotationMatrix) {
        int axisX = SensorManager.AXIS_X;
        int axisY = SensorManager.AXIS_Y;

        int rotation = getDisplayRotation();
        switch (rotation) {
            case Surface.ROTATION_90:
                axisX = SensorManager.AXIS_Y;
                axisY = SensorManager.AXIS_MINUS_X;
                break;
            case Surface.ROTATION_180:
                axisX = SensorManager.AXIS_MINUS_X;
                axisY = SensorManager.AXIS_MINUS_Y;
                break;
            case Surface.ROTATION_270:
                axisX = SensorManager.AXIS_MINUS_Y;
                axisY = SensorManager.AXIS_X;
                break;
            default:
                break;
        }

        // When the phone is held nearly upright, remap Y to Z to avoid gimbal lock.
        if (Math.abs(rotationMatrix[8]) < 0.35f) {
            axisY = SensorManager.AXIS_Z;
        }

        float[] targetMatrix = rotationMatrix;
        if (SensorManager.remapCoordinateSystem(rotationMatrix, axisX, axisY, remappedMatrix)) {
            targetMatrix = remappedMatrix;
        }

        SensorManager.getOrientation(targetMatrix, orientationValues);
        float magneticAzimuth = (float) Math.toDegrees(orientationValues[0]);
        float trueAzimuth = (magneticAzimuth + compassDeclination + 360f) % 360f;
        return smoothCircularHeading(trueAzimuth);
    }

    private float smoothCircularHeading(float headingDeg) {
        double rad = Math.toRadians(headingDeg);
        double sinVal = Math.sin(rad);
        double cosVal = Math.cos(rad);
        if (!hasSmoothedHeading) {
            smoothedSin = sinVal;
            smoothedCos = cosVal;
            hasSmoothedHeading = true;
        } else {
            smoothedSin += COMPASS_SMOOTH_ALPHA * (sinVal - smoothedSin);
            smoothedCos += COMPASS_SMOOTH_ALPHA * (cosVal - smoothedCos);
        }
        double smoothedDeg = Math.toDegrees(Math.atan2(smoothedSin, smoothedCos));
        return (float) ((smoothedDeg + 360.0) % 360.0);
    }

    private final SensorEventListener compassListener = new SensorEventListener() {
        @Override
        public void onSensorChanged(SensorEvent event) {
            long now = System.currentTimeMillis();
            if (now - lastCompassUpdate < 40) { // ~25 fps throttle
                return;
            }

            float azimuth = -1f;

            if (event.sensor.getType() == Sensor.TYPE_ROTATION_VECTOR) {
                SensorManager.getRotationMatrixFromVector(rMatrix, event.values);
                azimuth = computeTiltCompensatedAzimuth(rMatrix);
            } else {
                if (event.sensor.getType() == Sensor.TYPE_ACCELEROMETER) {
                    System.arraycopy(event.values, 0, lastAccelerometer, 0, Math.min(event.values.length, 3));
                    lastAccelerometerSet = true;
                } else if (event.sensor.getType() == Sensor.TYPE_MAGNETIC_FIELD) {
                    System.arraycopy(event.values, 0, lastMagnetometer, 0, Math.min(event.values.length, 3));
                    lastMagnetometerSet = true;
                }

                if (lastAccelerometerSet && lastMagnetometerSet) {
                    boolean success = SensorManager.getRotationMatrix(rMatrix, null, lastAccelerometer, lastMagnetometer);
                    if (success) {
                        azimuth = computeTiltCompensatedAzimuth(rMatrix);
                    }
                }
            }

            if (azimuth >= 0f) {
                lastCompassUpdate = now;
                JSObject ret = new JSObject();
                ret.put("heading", azimuth);
                notifyListeners("compassHeading", ret);
            }
        }

        @Override
        public void onAccuracyChanged(Sensor sensor, int accuracy) {}
    };

    private boolean registerCompassSensors() {
        if (sensorManager == null) {
            sensorManager = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        }
        if (sensorManager == null) {
            return false;
        }
        if (isCompassListening) {
            return true;
        }
        hasSmoothedHeading = false;
        lastAccelerometerSet = false;
        lastMagnetometerSet = false;

        rotationSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
        if (rotationSensor != null) {
            sensorManager.registerListener(compassListener, rotationSensor, SensorManager.SENSOR_DELAY_UI);
            isCompassListening = true;
            return true;
        }

        accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        magnetometer = sensorManager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD);
        if (accelerometer != null && magnetometer != null) {
            sensorManager.registerListener(compassListener, accelerometer, SensorManager.SENSOR_DELAY_UI);
            sensorManager.registerListener(compassListener, magnetometer, SensorManager.SENSOR_DELAY_UI);
            isCompassListening = true;
            return true;
        }
        return false;
    }

    private void unregisterCompassSensors() {
        if (sensorManager != null && isCompassListening) {
            sensorManager.unregisterListener(compassListener);
            isCompassListening = false;
        }
        hasSmoothedHeading = false;
    }

    @PluginMethod
    public void startCompass(PluginCall call) {
        Double lat = call.getDouble("lat");
        Double lng = call.getDouble("lng");
        if (lat != null && lng != null && !lat.isNaN() && !lng.isNaN()) {
            try {
                GeomagneticField field = new GeomagneticField(
                        lat.floatValue(),
                        lng.floatValue(),
                        0f,
                        System.currentTimeMillis()
                );
                compassDeclination = field.getDeclination();
            } catch (Exception e) {
                compassDeclination = 0f;
            }
        } else {
            compassDeclination = 0f;
        }

        compassRequested = true;
        boolean started = registerCompassSensors();
        if (!started) {
            compassRequested = false;
            call.reject("Compass sensors unavailable");
            return;
        }

        JSObject res = new JSObject();
        res.put("started", true);
        res.put("declination", compassDeclination);
        call.resolve(res);
    }

    @PluginMethod
    public void stopCompass(PluginCall call) {
        compassRequested = false;
        unregisterCompassSensors();
        JSObject res = new JSObject();
        res.put("stopped", true);
        call.resolve(res);
    }

    private boolean hasValidMp3Header(File file) {
        if (file == null || !file.isFile() || file.length() < 16) {
            return false;
        }
        try (FileInputStream fis = new FileInputStream(file)) {
            byte[] hdr = new byte[4];
            if (fis.read(hdr) < 3) {
                return false;
            }
            if (hdr[0] == 0x49 && hdr[1] == 0x44 && hdr[2] == 0x33) {
                return true;
            }
            if (hdr[0] == (byte) 0xFF && (hdr[1] & 0xE0) == 0xE0) {
                return true;
            }
        } catch (IOException ignored) {
            return false;
        }
        return false;
    }

    @PluginMethod
    public void setKeepScreenOn(PluginCall call) {
        final boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        final Activity activity = getActivity();
        if (activity == null) {
            call.resolve();
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                if (enabled) {
                    activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                } else {
                    activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
            } catch (Exception ignored) {}
            call.resolve();
        });
    }

    @PluginMethod
    public void getDeviceInfo(PluginCall call) {
        JSObject res = new JSObject();
        res.put("manufacturer", Build.MANUFACTURER != null ? Build.MANUFACTURER : "");
        res.put("brand", Build.BRAND != null ? Build.BRAND : "");
        res.put("model", Build.MODEL != null ? Build.MODEL : "");
        res.put("sdkInt", Build.VERSION.SDK_INT);
        call.resolve(res);
    }

    @PluginMethod
    public void setWidgetStyle(PluginCall call) {
        String style = call.getString("style", "solid");
        TazkeerPrayerWidget.setWidgetStyle(getContext(), style);
        JSObject res = new JSObject();
        res.put("style", style);
        call.resolve(res);
    }

    @Override
    protected void handleOnPause() {
        unregisterCompassSensors();
        super.handleOnPause();
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        if (compassRequested) {
            registerCompassSensors();
        }
    }

    @Override
    protected void handleOnDestroy() {
        compassRequested = false;
        unregisterCompassSensors();
        downloadExecutor.shutdownNow();
        super.handleOnDestroy();
    }
}

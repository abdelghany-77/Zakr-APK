package com.abdelghany.tazkeer.adhan;

import android.Manifest;
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

import java.io.File;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.abdelghany.tazkeer.MainActivity;
import com.abdelghany.tazkeer.R;
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
    private static final Pattern SAFE_SOUND_PATTERN = Pattern.compile("^[a-z0-9_]{1,40}$");
    private static final int MAX_DOWNLOAD_REDIRECTS = 5;
    private static final Set<String> ALLOWED_AUDIO_HOSTS = new HashSet<>(Arrays.asList(
            "archive.org",
            "cdn.islamic.network",
            "download.quranicaudio.com",
            "islamcan.com",
            "www.islamcan.com",
            "cdn.jsdelivr.net",
            "raw.githubusercontent.com"
    ));
    private final ExecutorService downloadExecutor = Executors.newSingleThreadExecutor();

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

    private static boolean isValidSoundId(String sound) {
        return sound != null && SAFE_SOUND_PATTERN.matcher(sound).matches();
    }

    private static boolean isAllowedDownloadUrl(String urlString) {
        if (urlString == null || urlString.isEmpty()) {
            return false;
        }
        try {
            java.net.URL url = new java.net.URL(urlString);
            if (!"https".equalsIgnoreCase(url.getProtocol())) {
                return false;
            }
            String host = url.getHost();
            if (host == null || host.isEmpty()) {
                return false;
            }
            String lowerHost = host.toLowerCase(Locale.US);
            if (ALLOWED_AUDIO_HOSTS.contains(lowerHost)) {
                return true;
            }
            return lowerHost.endsWith(".archive.org");
        } catch (Exception e) {
            return false;
        }
    }

    @PluginMethod
    public void isMuezzinDownloaded(PluginCall call) {
        String sound = call.getString("sound");
        if (!isValidSoundId(sound)) {
            call.reject("Invalid sound parameter");
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
        if (!isValidSoundId(sound)) {
            call.reject("Invalid sound identifier");
            return;
        }
        if (!isAllowedDownloadUrl(urlString)) {
            call.reject("Unsupported or insecure audio download URL");
            return;
        }

        downloadExecutor.execute(() -> {
            File targetFile = new File(getContext().getFilesDir(), sound + ".mp3");
            File tempFile = new File(getContext().getFilesDir(), sound + ".tmp");
            java.io.InputStream in = null;
            java.io.FileOutputStream out = null;
            java.net.HttpURLConnection conn = null;
            try {
                String currentUrl = urlString;
                int responseCode = -1;
                for (int redirectCount = 0; redirectCount <= MAX_DOWNLOAD_REDIRECTS; redirectCount++) {
                    if (!isAllowedDownloadUrl(currentUrl)) {
                        throw new java.io.IOException("Redirected to disallowed URL");
                    }
                    java.net.URL url = new java.net.URL(currentUrl);
                    conn = (java.net.HttpURLConnection) url.openConnection();
                    conn.setConnectTimeout(15000);
                    conn.setReadTimeout(30000);
                    conn.setInstanceFollowRedirects(false);
                    conn.setRequestProperty("User-Agent", "Tazkeer-App/2.2");
                    conn.connect();

                    responseCode = conn.getResponseCode();
                    if (responseCode == java.net.HttpURLConnection.HTTP_MOVED_PERM
                            || responseCode == java.net.HttpURLConnection.HTTP_MOVED_TEMP
                            || responseCode == java.net.HttpURLConnection.HTTP_SEE_OTHER
                            || responseCode == 307
                            || responseCode == 308) {
                        String location = conn.getHeaderField("Location");
                        conn.disconnect();
                        conn = null;
                        if (location == null || location.isEmpty()) {
                            throw new java.io.IOException("Missing redirect location");
                        }
                        java.net.URL nextUrl = new java.net.URL(url, location);
                        currentUrl = nextUrl.toString();
                        continue;
                    }
                    break;
                }

                if (conn == null || responseCode != java.net.HttpURLConnection.HTTP_OK) {
                    throw new java.io.IOException("HTTP error code: " + responseCode);
                }

                in = conn.getInputStream();
                out = new java.io.FileOutputStream(tempFile);
                byte[] buffer = new byte[8192];
                int bytesRead;
                while ((bytesRead = in.read(buffer)) != -1) {
                    out.write(buffer, 0, bytesRead);
                }
                out.flush();
                out.close();
                out = null;
                in.close();
                in = null;

                if (tempFile.length() < 10000) {
                    tempFile.delete();
                    throw new java.io.IOException("Downloaded file is too small or corrupt");
                }

                if (targetFile.exists()) {
                    targetFile.delete();
                }
                if (!tempFile.renameTo(targetFile)) {
                    throw new java.io.IOException("Failed to save audio file");
                }

                JSObject res = new JSObject();
                res.put("success", true);
                res.put("sound", sound);
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
                    if (out != null) out.close();
                } catch (Exception ignored) {
                }
                if (conn != null) {
                    conn.disconnect();
                }
            }
        });
    }

    @PluginMethod
    public void deleteMuezzin(PluginCall call) {
        String sound = call.getString("sound");
        if (!isValidSoundId(sound)) {
            call.reject("Invalid sound parameter");
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

        // Google Play policy restricts REQUEST_IGNORE_BATTERY_OPTIMIZATIONS.
        // Directing the user to the standard system battery optimization list
        // (or app details) requires no restricted permission while preserving
        // full background reliability.
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
        ensureAzkarChannel();

        Context context = getContext();
        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) {
            call.reject("NotificationManager unavailable");
            return;
        }

        String section = call.getString("section", "tab-azkar");
        String safeSection = (section == null || section.trim().isEmpty()) ? "tab-azkar" : section.trim();
        Intent intent = new Intent(
                Intent.ACTION_VIEW,
                Uri.parse("tazkeer://open/" + safeSection),
                context,
                MainActivity.class
        );
        intent.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK
                        | Intent.FLAG_ACTIVITY_CLEAR_TOP
                        | Intent.FLAG_ACTIVITY_SINGLE_TOP
        );
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        int notifId = call.getInt("id", 99001);
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

        // Channel sound plays automatically on Android 8+; do not call playNotificationTone()
        // again or the sound will play multiple times.
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
    // Native Hardware Qibla Compass
    // ========================================================================

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
    private float smoothedHeading = -1f;
    private float magneticDeclination = 0f;

    private final SensorEventListener compassListener = new SensorEventListener() {
        @Override
        public void onSensorChanged(SensorEvent event) {
            long now = System.currentTimeMillis();
            if (now - lastCompassUpdate < 40) { // ~25 fps throttle
                return;
            }

            boolean hasRotation = false;

            if (event.sensor.getType() == Sensor.TYPE_ROTATION_VECTOR) {
                SensorManager.getRotationMatrixFromVector(rMatrix, event.values);
                hasRotation = true;
            } else {
                if (event.sensor.getType() == Sensor.TYPE_ACCELEROMETER) {
                    System.arraycopy(event.values, 0, lastAccelerometer, 0, Math.min(3, event.values.length));
                    lastAccelerometerSet = true;
                } else if (event.sensor.getType() == Sensor.TYPE_MAGNETIC_FIELD) {
                    System.arraycopy(event.values, 0, lastMagnetometer, 0, Math.min(3, event.values.length));
                    lastMagnetometerSet = true;
                }

                if (lastAccelerometerSet && lastMagnetometerSet) {
                    hasRotation = SensorManager.getRotationMatrix(rMatrix, null, lastAccelerometer, lastMagnetometer);
                }
            }

            if (!hasRotation) {
                return;
            }

            // Remap axes if device is tilted upright (e.g., held vertically while checking Qibla)
            float[] activeMatrix = rMatrix;
            if (Math.abs(rMatrix[8]) < 0.35f) {
                if (SensorManager.remapCoordinateSystem(
                        rMatrix,
                        SensorManager.AXIS_X,
                        SensorManager.AXIS_Z,
                        remappedMatrix
                )) {
                    activeMatrix = remappedMatrix;
                }
            }

            SensorManager.getOrientation(activeMatrix, orientationValues);
            float rawAzimuth = (float) Math.toDegrees(orientationValues[0]);
            rawAzimuth = (rawAzimuth + magneticDeclination + 360f) % 360f;

            // Circular low-pass filter handling 0/360 wraparound cleanly
            if (smoothedHeading < 0f) {
                smoothedHeading = rawAzimuth;
            } else {
                float delta = ((rawAzimuth - smoothedHeading + 540f) % 360f) - 180f;
                smoothedHeading = (smoothedHeading + 0.22f * delta + 360f) % 360f;
            }

            lastCompassUpdate = now;
            JSObject ret = new JSObject();
            ret.put("heading", smoothedHeading);
            notifyListeners("compassHeading", ret);
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

        lastAccelerometerSet = false;
        lastMagnetometerSet = false;
        smoothedHeading = -1f;

        rotationSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
        if (rotationSensor != null) {
            isCompassListening = sensorManager.registerListener(
                    compassListener,
                    rotationSensor,
                    SensorManager.SENSOR_DELAY_UI
            );
            return isCompassListening;
        }

        accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        magnetometer = sensorManager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD);
        if (accelerometer != null && magnetometer != null) {
            boolean accOk = sensorManager.registerListener(compassListener, accelerometer, SensorManager.SENSOR_DELAY_UI);
            boolean magOk = sensorManager.registerListener(compassListener, magnetometer, SensorManager.SENSOR_DELAY_UI);
            isCompassListening = accOk && magOk;
            if (!isCompassListening) {
                sensorManager.unregisterListener(compassListener);
            }
            return isCompassListening;
        }

        return false;
    }

    private void unregisterCompassSensors() {
        if (sensorManager != null && isCompassListening) {
            sensorManager.unregisterListener(compassListener);
            isCompassListening = false;
        }
    }

    @PluginMethod
    public void startCompass(PluginCall call) {
        Double lat = call.getDouble("latitude");
        Double lng = call.getDouble("longitude");
        if (lat != null && lng != null) {
            try {
                GeomagneticField field = new GeomagneticField(
                        lat.floatValue(),
                        lng.floatValue(),
                        0f,
                        System.currentTimeMillis()
                );
                magneticDeclination = field.getDeclination();
            } catch (Exception e) {
                magneticDeclination = 0f;
            }
        } else {
            magneticDeclination = 0f;
        }

        compassRequested = true;
        boolean started = registerCompassSensors();
        if (!started) {
            compassRequested = false;
        }

        JSObject res = new JSObject();
        res.put("started", started);
        res.put("available", started);
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

package com.abdelghany.tazkeer.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.SystemClock;
import android.util.Log;
import android.view.View;
import android.widget.RemoteViews;

import com.abdelghany.tazkeer.MainActivity;
import com.abdelghany.tazkeer.R;
import com.abdelghany.tazkeer.adhan.AdhanAlarmManager;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.HashMap;
import java.util.Map;

/**
 * ============================================================================
 * TazkeerPrayerWidget — Android home screen widget showing:
 *   1. Next prayer name & formatted Arabic time
 *   2. Live remaining-time countdown (Chronometer on API 24+, formatted fallback)
 *   3. Authentic daily dhikr (rotates daily + tap refresh to cycle)
 * ============================================================================
 */
public class TazkeerPrayerWidget extends AppWidgetProvider {

    private static final String TAG = "TazkeerWidget";
    private static final String PREFS_WIDGET = "tazkeer_widget_prefs";
    private static final String KEY_CITY = "widget_city";
    private static final String KEY_PRAYERS_JSON = "widget_prayers_json";
    private static final String KEY_DHIKR_OFFSET = "widget_dhikr_offset";
    private static final String KEY_CUSTOM_DHIKR = "widget_custom_dhikr";
    private static final String KEY_WIDGET_STYLE = "widget_bg_style";

    public static void setWidgetStyle(Context context, String style) {
        if (context == null) return;
        String normalized = "translucent".equals(style) || "glass".equals(style) ? style : "solid";
        context.getApplicationContext()
                .getSharedPreferences(PREFS_WIDGET, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_WIDGET_STYLE, normalized)
                .apply();
        updateAllWidgets(context);
    }

    public static final String ACTION_REFRESH = "com.abdelghany.tazkeer.widget.ACTION_REFRESH";

    private static final Map<String, String> PRAYER_NAMES_AR = new HashMap<>();
    static {
        PRAYER_NAMES_AR.put("Fajr", "صلاة الفجر");
        PRAYER_NAMES_AR.put("Dhuhr", "صلاة الظهر");
        PRAYER_NAMES_AR.put("Asr", "صلاة العصر");
        PRAYER_NAMES_AR.put("Maghrib", "صلاة المغرب");
        PRAYER_NAMES_AR.put("Isha", "صلاة العشاء");
    }

    private static final String[] DAILY_ADHKAR = new String[] {
            "سُبْحَانَ اللَّهِ وَبِحَمْدِهِ، سُبْحَانَ اللَّهِ الْعَظِيمِ",
            "لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ",
            "أَسْتَغْفِرُ اللَّهَ الْعَظِيمَ الَّذِي لَا إِلَهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ وَأَتُوبُ إِلَيْهِ",
            "اللَّهُمَّ صَلِّ وَسَلِّمْ وَبَارِكْ عَلَى نَبِيِّنَا مُحَمَّدٍ",
            "لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ الْعَلِيِّ الْعَظِيمِ",
            "سُبْحَانَ اللَّهِ، وَالْحَمْدُ لِلَّهِ، وَلَا إِلَهَ إِلَّا اللَّهُ، وَاللَّهُ أَكْبَرُ",
            "يَا حَيُّ يَا قَيُّومُ بِرَحْمَتِكَ أَسْتَغِيثُ، أَصْلِحْ لِي شَأْنِي كُلَّهُ",
            "حَسْبِيَ اللَّهُ لَا إِلَهَ إِلَّا هُوَ عَلَيْهِ تَوَكَّلْتُ وَهُوَ رَبُّ الْعَرْشِ الْعَظِيمِ",
            "اللَّهُمَّ أَعِنِّي عَلَى ذِكْرِكَ وَشُكْرِكَ وَحُسْنِ عِبَادَتِكَ",
            "رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ",
            "لَا إِلَهَ إِلَّا أَنْتَ سُبْحَانَكَ إِنِّي كُنْتُ مِنَ الظَّالِمِينَ",
            "اللَّهُمَّ إِنِّي أَسْأَلُكَ الْعَفْوَ وَالْعَافِيَةَ فِي الدُّنْيَا وَالْآخِرَةِ",
            "رَضِيتُ بِاللَّهِ رَبًّا، وَبِالْإِسْلَامِ دِينًا، وَبِمُحَمَّدٍ ﷺ نَبِيًّا",
            "اللَّهُمَّ إِنِّي أَسْأَلُكَ عِلْمًا نَافِعًا، وَرِزْقًا طَيِّبًا، وَعَمَلًا مُتَقَبَّلًا",
            "سُبْحَانَ اللَّهِ وَبِحَمْدِهِ عَدَدَ خَلْقِهِ، وَرِضَا نَفْسِهِ، وَزِنَةَ عَرْشِهِ، وَمِدَادَ كَلِمَاتِهِ",
            "اللَّهُمَّ اغْفِرْ لِي وَارْحَمْنِي وَاهْدِنِي وَعَافِنِي وَارْزُقْنِي",
            "اللَّهُمَّ يَا مُقَلِّبَ الْقُلُوبِ ثَبِّتْ قَلْبِي عَلَى دِينِكَ",
            "بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ وَهُوَ السَّمِيعُ الْعَلِيمُ",
            "أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ",
            "اللَّهُمَّ إِنَّكَ عَفُوٌّ تُحِبُّ الْعَفْوَ فَاعْفُ عَنِّي",
            "رَبِّ اشْرَحْ لِي صَدْرِي وَيَسِّرْ لِي أَمْرِي"
    };

    // ------------------------------------------------------------------------
    // AppWidgetProvider lifecycle
    // ------------------------------------------------------------------------

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        if (appWidgetIds == null || appWidgetIds.length == 0) {
            return;
        }
        for (int widgetId : appWidgetIds) {
            try {
                updateSingleWidget(context, appWidgetManager, widgetId);
            } catch (Exception e) {
                Log.e(TAG, "Failed to update widget id=" + widgetId, e);
            }
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (intent == null || intent.getAction() == null) {
            return;
        }
        String action = intent.getAction();
        if (ACTION_REFRESH.equals(action)) {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_WIDGET, Context.MODE_PRIVATE);
            int nextOffset = (prefs.getInt(KEY_DHIKR_OFFSET, 0) + 1) % DAILY_ADHKAR.length;
            prefs.edit()
                    .putInt(KEY_DHIKR_OFFSET, nextOffset)
                    .remove(KEY_CUSTOM_DHIKR)
                    .apply();
            updateAllWidgets(context);
        } else if (Intent.ACTION_TIME_CHANGED.equals(action)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(action)
                || Intent.ACTION_DATE_CHANGED.equals(action)) {
            updateAllWidgets(context);
        }
    }

    // ------------------------------------------------------------------------
    // Static persistence & refresh helpers (called by plugin / receivers)
    // ------------------------------------------------------------------------

    public static void saveWidgetData(Context context, String cityName, JSONArray prayers, String dailyDhikr) {
        if (context == null) return;
        SharedPreferences.Editor editor = context.getApplicationContext()
                .getSharedPreferences(PREFS_WIDGET, Context.MODE_PRIVATE)
                .edit();
        if (cityName != null) {
            editor.putString(KEY_CITY, cityName.trim());
        }
        if (prayers != null && prayers.length() > 0) {
            editor.putString(KEY_PRAYERS_JSON, prayers.toString());
        }
        if (dailyDhikr != null && !dailyDhikr.trim().isEmpty()) {
            editor.putString(KEY_CUSTOM_DHIKR, dailyDhikr.trim());
        }
        editor.apply();
        updateAllWidgets(context);
    }

    public static void updateAllWidgets(Context context) {
        if (context == null) return;
        try {
            Context appContext = context.getApplicationContext();
            AppWidgetManager manager = AppWidgetManager.getInstance(appContext);
            if (manager == null) return;
            ComponentName provider = new ComponentName(appContext, TazkeerPrayerWidget.class);
            int[] ids = manager.getAppWidgetIds(provider);
            if (ids == null || ids.length == 0) return;
            for (int id : ids) {
                updateSingleWidget(appContext, manager, id);
            }
        } catch (Exception e) {
            Log.e(TAG, "updateAllWidgets failed", e);
        }
    }

    // ------------------------------------------------------------------------
    // Rendering
    // ------------------------------------------------------------------------

    private static void updateSingleWidget(Context context, AppWidgetManager manager, int widgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_prayer_dhikr);
        SharedPreferences prefs = context.getSharedPreferences(PREFS_WIDGET, Context.MODE_PRIVATE);

        String bgStyle = prefs.getString(KEY_WIDGET_STYLE, "solid");
        int bgRes = R.drawable.widget_bg;
        if ("translucent".equals(bgStyle)) {
            bgRes = R.drawable.widget_bg_translucent;
        } else if ("glass".equals(bgStyle)) {
            bgRes = R.drawable.widget_bg_glass;
        }
        views.setInt(R.id.widgetRoot, "setBackgroundResource", bgRes);

        String city = prefs.getString(KEY_CITY, "");
        if (city != null && !city.isEmpty()) {
            views.setTextViewText(R.id.widgetCityName, "• " + city);
            views.setViewVisibility(R.id.widgetCityName, View.VISIBLE);
        } else {
            views.setViewVisibility(R.id.widgetCityName, View.GONE);
        }

        // Resolve the next upcoming prayer from widget schedule or AdhanAlarmManager ledger.
        NextPrayerInfo next = null;
        try {
            next = findNextPrayer(context, prefs);
        } catch (Exception e) {
            Log.w(TAG, "findNextPrayer fallback", e);
        }
        if (next != null) {
            views.setTextViewText(R.id.widgetPrayerName, next.nameAr);
            views.setTextViewText(R.id.widgetPrayerTime, formatArabicTime12h(next.triggerAt));

            long remainingMs = Math.max(0L, next.triggerAt - System.currentTimeMillis());
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                views.setViewVisibility(R.id.widgetCountdownChrono, View.VISIBLE);
                views.setViewVisibility(R.id.widgetCountdownText, View.GONE);
                views.setChronometerCountDown(R.id.widgetCountdownChrono, true);
                views.setChronometer(
                        R.id.widgetCountdownChrono,
                        SystemClock.elapsedRealtime() + remainingMs,
                        "%s",
                        true
                );
            } else {
                views.setViewVisibility(R.id.widgetCountdownChrono, View.GONE);
                views.setViewVisibility(R.id.widgetCountdownText, View.VISIBLE);
                views.setTextViewText(R.id.widgetCountdownText, formatRemainingArabic(remainingMs));
            }
        } else {
            views.setTextViewText(R.id.widgetPrayerName, context.getString(R.string.widget_default_prayer));
            views.setTextViewText(R.id.widgetPrayerTime, "--:--");
            views.setViewVisibility(R.id.widgetCountdownChrono, View.GONE);
            views.setViewVisibility(R.id.widgetCountdownText, View.VISIBLE);
            views.setTextViewText(R.id.widgetCountdownText, context.getString(R.string.widget_tap_to_sync));
        }

        // Daily Dhikr
        String dhikr = resolveDailyDhikr(prefs);
        views.setTextViewText(R.id.widgetDhikrText, dhikr);

        // Tap targets
        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        }

        // 1) Prayer area -> open Home/Prayers
        Intent openHome = new Intent(context, MainActivity.class);
        openHome.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent homePi = PendingIntent.getActivity(context, 8101, openHome, pendingFlags);
        views.setOnClickPendingIntent(R.id.widgetPrayerArea, homePi);

        // 2) Dhikr area -> open Azkar tab directly via deep link
        Intent openAzkar = new Intent(Intent.ACTION_VIEW, Uri.parse("tazkeer://open/tab-azkar"), context, MainActivity.class);
        openAzkar.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent azkarPi = PendingIntent.getActivity(context, 8102, openAzkar, pendingFlags);
        views.setOnClickPendingIntent(R.id.widgetDhikrArea, azkarPi);

        // 3) Refresh button -> cycle dhikr & refresh countdown
        Intent refreshIntent = new Intent(context, TazkeerPrayerWidget.class);
        refreshIntent.setAction(ACTION_REFRESH);
        PendingIntent refreshPi = PendingIntent.getBroadcast(context, 8103, refreshIntent, pendingFlags);
        views.setOnClickPendingIntent(R.id.widgetRefreshBtn, refreshPi);

        // 4) Quick shortcut: Quran reader
        Intent openQuran = new Intent(Intent.ACTION_VIEW, Uri.parse("tazkeer://open/tab-quran"), context, MainActivity.class);
        openQuran.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent quranPi = PendingIntent.getActivity(context, 8104, openQuran, pendingFlags);
        views.setOnClickPendingIntent(R.id.widgetShortcutQuran, quranPi);

        // 5) Quick shortcut: Azkar
        Intent openAzkarShortcut = new Intent(Intent.ACTION_VIEW, Uri.parse("tazkeer://open/tab-azkar"), context, MainActivity.class);
        openAzkarShortcut.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent azkarShortcutPi = PendingIntent.getActivity(context, 8105, openAzkarShortcut, pendingFlags);
        views.setOnClickPendingIntent(R.id.widgetShortcutAzkar, azkarShortcutPi);

        manager.updateAppWidget(widgetId, views);
    }

    private static String resolveDailyDhikr(SharedPreferences prefs) {
        String custom = prefs.getString(KEY_CUSTOM_DHIKR, "");
        if (custom != null && !custom.trim().isEmpty()) {
            return custom.trim();
        }
        int dayOfYear = Calendar.getInstance().get(Calendar.DAY_OF_YEAR);
        int offset = prefs.getInt(KEY_DHIKR_OFFSET, 0);
        int idx = Math.abs(dayOfYear + offset) % DAILY_ADHKAR.length;
        return DAILY_ADHKAR[idx];
    }

    private static NextPrayerInfo findNextPrayer(Context context, SharedPreferences prefs) {
        long now = System.currentTimeMillis();
        NextPrayerInfo best = null;

        // 1. Check dedicated widget prayer schedule (works even if Adhan alarms are disabled)
        String rawWidget = prefs.getString(KEY_PRAYERS_JSON, "[]");
        best = pickEarliestFuture(best, parseJsonArraySafe(rawWidget), now);

        // 2. Also check AdhanAlarmManager future ledger as fallback / complement
        best = pickEarliestFuture(best, AdhanAlarmManager.getFutureAlarms(context), now);
        return best;
    }

    private static NextPrayerInfo pickEarliestFuture(NextPrayerInfo currentBest, JSONArray list, long now) {
        if (list == null) return currentBest;
        NextPrayerInfo best = currentBest;
        for (int i = 0; i < list.length(); i++) {
            JSONObject obj = list.optJSONObject(i);
            if (obj == null) continue;
            long triggerAt = obj.optLong("time", 0L);
            String date = obj.optString("date", "");
            String timeOfDay = obj.optString("timeOfDay", "");
            if (triggerAt <= 0L && !date.isEmpty() && !timeOfDay.isEmpty()) {
                triggerAt = AdhanAlarmManager.toEpochMillis(date, timeOfDay);
            }
            if (triggerAt <= now + 1000L) continue;
            if (best == null || triggerAt < best.triggerAt) {
                String key = obj.optString("prayer", "");
                String label = obj.optString("nameAr", "");
                if (label.isEmpty()) {
                    label = PRAYER_NAMES_AR.containsKey(key)
                            ? PRAYER_NAMES_AR.get(key)
                            : obj.optString("label", "الصلاة القادمة");
                }
                best = new NextPrayerInfo(label, triggerAt);
            }
        }
        return best;
    }

    private static JSONArray parseJsonArraySafe(String raw) {
        if (raw == null || raw.isEmpty()) return new JSONArray();
        try {
            return new JSONArray(raw);
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    private static String formatArabicTime12h(long epochMs) {
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(epochMs);
        int hour24 = cal.get(Calendar.HOUR_OF_DAY);
        int minute = cal.get(Calendar.MINUTE);
        String period = hour24 >= 12 ? "م" : "ص";
        int hour12 = hour24 % 12;
        if (hour12 == 0) hour12 = 12;
        String minStr = (minute < 10 ? "0" : "") + minute;
        return toArabicDigits(hour12 + ":" + minStr) + " " + period;
    }

    private static String formatRemainingArabic(long remainingMs) {
        long totalMinutes = Math.max(1L, (remainingMs + 30_000L) / 60_000L);
        long hours = totalMinutes / 60L;
        long mins = totalMinutes % 60L;
        if (hours > 0 && mins > 0) {
            return toArabicDigits(hours + " س " + mins + " د");
        }
        if (hours > 0) {
            return toArabicDigits(hours + " س");
        }
        return toArabicDigits(mins + " د");
    }

    private static String toArabicDigits(String input) {
        if (input == null) return "";
        char[] digits = new char[] {'٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'};
        StringBuilder out = new StringBuilder(input.length());
        for (int i = 0; i < input.length(); i++) {
            char c = input.charAt(i);
            if (c >= '0' && c <= '9') {
                out.append(digits[c - '0']);
            } else {
                out.append(c);
            }
        }
        return out.toString();
    }

    private static final class NextPrayerInfo {
        final String nameAr;
        final long triggerAt;

        NextPrayerInfo(String nameAr, long triggerAt) {
            this.nameAr = nameAr;
            this.triggerAt = triggerAt;
        }
    }
}

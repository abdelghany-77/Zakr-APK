package com.abdelghany.tazkeer.adhan;

import android.app.AlarmManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * ============================================================================
 * AdhanBootReceiver — self-healing schedule across reboots & clock changes.
 * ============================================================================
 *
 * AlarmManager forgets all alarms when the device reboots. Android also does
 * not adjust RTC alarms when the user changes the timezone or the wall clock.
 *
 * This receiver reloads the persisted 7-day ledger and re-registers every
 * future alarm with setAlarmClock(), recomputing epoch millis from the stored
 * local date + HH:mm when available (so timezone travel stays correct).
 *
 * Notes:
 *  - BOOT_COMPLETED is not delivered if the user force-stopped the app from
 *    Settings. Opening the app once restores the schedule.
 *  - MY_PACKAGE_REPLACED covers APK updates.
 *  - ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED upgrades alarms
 *    immediately once the user grants exact-alarm permission on Android 12+.
 */
public class AdhanBootReceiver extends BroadcastReceiver {

    private static final String TAG = "TazkeerAdhan";
    private static final Set<String> ALLOWED_ACTIONS = new HashSet<>(Arrays.asList(
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            Intent.ACTION_TIME_CHANGED,
            Intent.ACTION_TIMEZONE_CHANGED,
            Intent.ACTION_DATE_CHANGED,
            "android.intent.action.QUICKBOOT_POWERON",
            "com.htc.intent.action.QUICKBOOT_POWERON",
            AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED
    ));

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) {
            return;
        }

        String action = intent.getAction();
        if (!ALLOWED_ACTIONS.contains(action)) {
            Log.w(TAG, "Ignoring unexpected broadcast action: " + action);
            return;
        }

        Log.i(TAG, "Rescheduling adhan alarms after: " + action);

        try {
            int restored = AdhanAlarmManager.rescheduleStored(context);
            Log.i(TAG, "Restored " + restored + " adhan alarms");
            int adhkarRestored = AdhkarAlarmManager.rescheduleStored(context);
            Log.i(TAG, "Restored " + adhkarRestored + " adhkar reminders");
        } catch (Exception e) {
            Log.e(TAG, "Failed to restore adhan alarms", e);
        }
    }
}

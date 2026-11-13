package com.betspapa.scores.watch;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.os.SystemClock;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import com.betspapa.watch.AlertPlanner;
import com.betspapa.watch.WatchState;
import java.util.concurrent.TimeUnit;

public final class WatchScheduler {
    public static final String PREFS = "betspapa-watch";
    public static final String ASKED_NOTIFICATIONS = "asked_notifications";
    public static final String SETUP_VERSION = "alert_setup_version";
    public static final String SETUP_FINISHED = "alert_setup_finished";
    /** Debug builds only. Lets an emulator show the exact-alarm and Autostart steps. */
    public static final String QC_EXACT = "qc_exact";
    public static final String QC_MANUFACTURER = "qc_manufacturer";
    public static final String QC_BRAND = "qc_brand";

    private static final String PERIODIC = "betspapa-watch";
    private static final String ONCE = "betspapa-watch-now";
    private static final int ALARM_CODE = 41;
    private static final int WATCHDOG_CODE = 42;
    private static final int RESTART_CODE = 43;
    private static final int TEST_CODE = 77;
    /** Doze-safe check that the process is still polling. HiOS drops a dead process's Handler. */
    public static final long WATCHDOG_MS = 5L * 60L * 1000L;
    public static final String ACTION_WATCHDOG = "com.betspapa.scores.watch.WATCHDOG";
    public static final String ACTION_RESTART = "com.betspapa.scores.watch.RESTART";
    /** Restart heartbeat while a match is live, in case the process was killed. */
    private static final long HEARTBEAT_MS = 45_000L;
    private static volatile boolean uiForeground;

    private WatchScheduler() {}

    public static boolean isUiForeground() {
        return uiForeground;
    }

    /** Records the activity flag without arming WorkManager. Unit tests use this. */
    static void noteUiForeground(boolean foreground) {
        uiForeground = foreground;
    }

    /**
     * The activity being visible is when Android still allows a foreground service
     * to start. Leaving the screen must not be the moment we try to start one:
     * on Android 12+ that throws and the exception used to be swallowed, so the
     * watcher never ran while the user was outside the app.
     */
    public static void setUiForeground(Context context, boolean foreground) {
        uiForeground = foreground;
        ensureWatching(context);
        arm(context);
    }

    public static void ensurePeriodic(Context context) {
        Constraints constraints = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        PeriodicWorkRequest work = new PeriodicWorkRequest.Builder(FixtureRefreshWorker.class, 15, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .build();
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.UPDATE, work);
    }

    public static void enqueueRefresh(Context context) {
        Constraints constraints = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        OneTimeWorkRequest once = new OneTimeWorkRequest.Builder(FixtureRefreshWorker.class).setConstraints(constraints).build();
        WorkManager.getInstance(context).enqueueUniqueWork(ONCE, ExistingWorkPolicy.REPLACE, once);
    }

    public static void arm(Context context) {
        ensurePeriodic(context);
        armWatchdog(context);
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        PendingIntent pending = alarmIntent(context);
        WatchState state = WatchState.load(WatchFiles.file(context));
        if (!ready(context, state)) {
            alarms.cancel(pending);
            alarms.cancel(watchdogIntent(context));
            context.stopService(new Intent(context, ScoreWatchService.class));
            return;
        }
        if (!WatchRuntime.serviceRunning) start(context);
        long now = System.currentTimeMillis();
        boolean hot = AlertPlanner.shouldWatch(state.matches, state, now);
        long trigger = hot ? now + HEARTBEAT_MS : now + WATCHDOG_MS;
        schedule(alarms, pending, trigger, 15_000L);
    }

    /** Fires even in Doze. Starts the service again if HiOS has killed it, then polls. */
    public static void armWatchdog(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        WatchState state = WatchState.load(WatchFiles.file(context));
        PendingIntent pending = watchdogIntent(context);
        if (!ready(context, state)) {
            alarms.cancel(pending);
            return;
        }
        schedule(alarms, pending, System.currentTimeMillis() + WATCHDOG_MS, WATCHDOG_MS);
    }

    /** Brought back a few seconds after a swipe. The process is usually already gone. */
    public static void scheduleRestart(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        schedule(alarms, restartIntent(context), System.currentTimeMillis() + 5_000L, 3_000L);
    }

    public static void onAlarm(Context context) {
        ensureWatching(context);
        if (WatchRuntime.serviceRunning) nudge(context);
        else start(context);
        arm(context);
    }

    public static void onWatchdog(Context context) {
        WatchState state = WatchState.load(WatchFiles.file(context));
        if (!ready(context, state)) return;
        if (!WatchRuntime.serviceRunning) start(context);
        else nudge(context);
        armWatchdog(context);
    }

    /** Ask the running watcher to poll now. A fresh start uses the foreground-service API. */
    public static void nudge(Context context) {
        Intent intent = new Intent(context, ScoreWatchService.class);
        intent.setAction(ScoreWatchService.ACTION_POLL);
        try {
            if (WatchRuntime.serviceRunning) context.startService(intent);
            else start(context);
        } catch (RuntimeException error) {
            start(context);
        }
    }

    public static void ensureWatching(Context context) {
        WatchState state = WatchState.load(WatchFiles.file(context));
        if (!ready(context, state)) return;
        long now = System.currentTimeMillis();
        if (AlertPlanner.shouldWatch(state.matches, state, now)) {
            if (!WatchRuntime.serviceRunning) start(context);
            return;
        }
        if (state.fixturesAt == 0L || now - state.fixturesAt >= AlertPlanner.FIXTURE_REFRESH_MS) enqueueRefresh(context);
    }

    /** Native notification about 10s later, including after the process has been swiped away. */
    public static void scheduleTest(Context context) {
        scheduleTest(context, "goal", "");
    }

    public static void scheduleTest(Context context, String kind, String soundOverride) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        WatchState state = WatchState.load(WatchFiles.file(context));
        String sound = soundOverride == null || soundOverride.isEmpty()
            ? (state.goalSound == null || state.goalSound.isEmpty() ? "crowd" : state.goalSound)
            : soundOverride;
        Intent intent = new Intent(context, TestAlertReceiver.class);
        intent.putExtra(TestAlertReceiver.EXTRA_SOUND, sound);
        intent.putExtra(TestAlertReceiver.EXTRA_KIND, kind == null || kind.isEmpty() ? "goal" : kind);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        int code = TEST_CODE + Math.abs((String.valueOf(kind) + ":" + sound).hashCode() % 40);
        PendingIntent pending = PendingIntent.getBroadcast(context, code, intent, flags);
        schedule(alarms, pending, System.currentTimeMillis() + 10_000L, 5_000L);
    }

    public static void requestBatteryExemption(Context context) {
        String pkg = context.getPackageName();
        Intent request = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
        request.setData(Uri.parse("package:" + pkg));
        if (!(context instanceof android.app.Activity)) request.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            context.startActivity(request);
        } catch (RuntimeException error) {
            Intent list = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            if (!(context instanceof android.app.Activity)) list.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                context.startActivity(list);
            } catch (RuntimeException ignored) {
                /* the settings hint still tells the user where to look */
            }
        }
    }

    public static boolean batteryUnrestricted(Context context) {
        PowerManager power = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        return power != null && power.isIgnoringBatteryOptimizations(context.getPackageName());
    }

    public static boolean canScheduleExactAlarms(Context context) {
        if (Build.VERSION.SDK_INT < 31) return true;
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        return alarms != null && alarms.canScheduleExactAlarms();
    }

    /** "unsupported" before Android 12. A debug override can force granted or denied. */
    public static String exactAlarmState(Context context, String override) {
        if (Build.VERSION.SDK_INT < 31) return "unsupported";
        if ("denied".equals(override)) return "denied";
        if ("granted".equals(override)) return "granted";
        return canScheduleExactAlarms(context) ? "granted" : "denied";
    }

    public static void requestExactAlarm(Context context) {
        if (Build.VERSION.SDK_INT < 31) return;
        if (canScheduleExactAlarms(context)) return;
        Intent scoped = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
        scoped.setData(Uri.parse("package:" + context.getPackageName()));
        Intent plain = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
        if (!launch(context, scoped)) launch(context, plain);
    }

    public static boolean isDebuggable(Context context) {
        return context != null && (context.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    private static boolean launch(Context context, Intent intent) {
        if (!(context instanceof android.app.Activity)) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            context.startActivity(intent);
            return true;
        } catch (RuntimeException error) {
            return false;
        }
    }

    static boolean ready(Context context, WatchState state) {
        return state.browser && state.hasInterest() && NotificationManagerCompat.from(context).areNotificationsEnabled();
    }

    private static boolean start(Context context) {
        try {
            ContextCompat.startForegroundService(context, new Intent(context, ScoreWatchService.class));
            return true;
        } catch (RuntimeException error) {
            return false;
        }
    }

    private static void schedule(AlarmManager alarms, PendingIntent pending, long trigger, long minDelay) {
        long elapsed = Math.max(trigger - System.currentTimeMillis(), minDelay);
        try {
            if (canExact(alarms)) {
                alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + elapsed, pending);
            } else {
                alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + elapsed, pending);
            }
        } catch (SecurityException error) {
            alarms.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + elapsed, pending);
        }
    }

    private static boolean canExact(AlarmManager alarms) {
        if (Build.VERSION.SDK_INT < 31) return true;
        return alarms.canScheduleExactAlarms();
    }

    private static PendingIntent alarmIntent(Context context) {
        Intent intent = new Intent(context, WatchAlarmReceiver.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(context, ALARM_CODE, intent, flags);
    }

    private static PendingIntent watchdogIntent(Context context) {
        Intent intent = new Intent(context, WatchAlarmReceiver.class);
        intent.setAction(ACTION_WATCHDOG);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(context, WATCHDOG_CODE, intent, flags);
    }

    private static PendingIntent restartIntent(Context context) {
        Intent intent = new Intent(context, WatchAlarmReceiver.class);
        intent.setAction(ACTION_RESTART);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(context, RESTART_CODE, intent, flags);
    }
}

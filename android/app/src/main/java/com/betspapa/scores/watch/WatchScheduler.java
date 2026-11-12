package com.betspapa.scores.watch;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
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

    private static final String PERIODIC = "betspapa-watch";
    private static final String ONCE = "betspapa-watch-now";
    private static final int ALARM_CODE = 41;
    private static final int TEST_CODE = 77;
    /** Restart heartbeat while a match is live, in case the process was killed. */
    private static final long HEARTBEAT_MS = 45_000L;
    private static volatile boolean uiForeground;

    private WatchScheduler() {}

    public static boolean isUiForeground() {
        return uiForeground;
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
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        PendingIntent pending = alarmIntent(context);
        WatchState state = WatchState.load(WatchFiles.file(context));
        if (!ready(context, state)) {
            alarms.cancel(pending);
            context.stopService(new Intent(context, ScoreWatchService.class));
            return;
        }
        long now = System.currentTimeMillis();
        boolean hot = AlertPlanner.shouldWatch(state.matches, state, now);
        if (hot) {
            if (!WatchRuntime.serviceRunning) start(context);
        } else if (WatchRuntime.serviceRunning) {
            context.stopService(new Intent(context, ScoreWatchService.class));
        }
        long trigger = hot ? now + HEARTBEAT_MS : Math.max(AlertPlanner.nextWake(state.matches, state, now), now + 15_000L);
        schedule(alarms, pending, trigger);
    }

    public static void onAlarm(Context context) {
        ensureWatching(context);
        if (WatchRuntime.serviceRunning) nudge(context);
        arm(context);
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
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        WatchState state = WatchState.load(WatchFiles.file(context));
        String sound = state.goalSound == null || state.goalSound.isEmpty() ? "crowd" : state.goalSound;
        Intent intent = new Intent(context, TestAlertReceiver.class);
        intent.putExtra(TestAlertReceiver.EXTRA_SOUND, sound);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pending = PendingIntent.getBroadcast(context, TEST_CODE, intent, flags);
        schedule(alarms, pending, System.currentTimeMillis() + 10_000L);
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

    private static void schedule(AlarmManager alarms, PendingIntent pending, long trigger) {
        long elapsed = Math.max(trigger - System.currentTimeMillis(), 15_000L);
        try {
            if (canExact(alarms)) {
                alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, pending);
            } else {
                alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, pending);
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
}

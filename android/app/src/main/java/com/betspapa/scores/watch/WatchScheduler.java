package com.betspapa.scores.watch;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.SystemClock;
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
    private static final String PERIODIC = "betspapa-watch";
    private static final String ONCE = "betspapa-watch-now";
    private static volatile boolean uiForeground;

    private WatchScheduler() {}

    public static boolean isUiForeground() {
        return uiForeground;
    }

    public static void setUiForeground(Context context, boolean foreground) {
        uiForeground = foreground;
        if (foreground) {
            context.stopService(new Intent(context, ScoreWatchService.class));
            return;
        }
        ensureWatching(context);
        arm(context);
    }

    public static void ensurePeriodic(Context context) {
        Constraints constraints = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        PeriodicWorkRequest work = new PeriodicWorkRequest.Builder(FixtureRefreshWorker.class, 15, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .build();
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, work);
    }

    public static void enqueueRefresh(Context context) {
        Constraints constraints = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        OneTimeWorkRequest once = new OneTimeWorkRequest.Builder(FixtureRefreshWorker.class).setConstraints(constraints).build();
        WorkManager.getInstance(context).enqueueUniqueWork(ONCE, ExistingWorkPolicy.KEEP, once);
    }

    public static void arm(Context context) {
        ensurePeriodic(context);
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        PendingIntent pending = pending(context);
        WatchState state = WatchState.load(WatchFiles.file(context));
        if (!ready(context, state)) {
            alarms.cancel(pending);
            context.stopService(new Intent(context, ScoreWatchService.class));
            return;
        }
        long now = System.currentTimeMillis();
        boolean hot = AlertPlanner.shouldWatch(state.matches, state, now);
        boolean started = false;
        if (hot && !uiForeground && !WatchRuntime.serviceRunning) started = start(context);
        long trigger;
        if (hot && !uiForeground && !started && !WatchRuntime.serviceRunning) trigger = now + 60_000L;
        else if (hot) trigger = now + 5 * 60_000L;
        else trigger = Math.max(AlertPlanner.nextWake(state.matches, state, now), now + 15_000L);
        long elapsed = trigger - now;
        try {
            if (canExact(alarms)) {
                alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, pending);
            } else {
                alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, pending);
            }
        } catch (SecurityException error) {
            alarms.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + Math.max(elapsed, 15_000L), pending);
        }
    }

    public static void onAlarm(Context context) {
        if (!uiForeground) ensureWatching(context);
        arm(context);
    }

    public static void ensureWatching(Context context) {
        if (uiForeground) return;
        WatchState state = WatchState.load(WatchFiles.file(context));
        if (!ready(context, state)) return;
        long now = System.currentTimeMillis();
        if (AlertPlanner.shouldWatch(state.matches, state, now)) {
            if (!WatchRuntime.serviceRunning) start(context);
            return;
        }
        if (state.fixturesAt == 0L || now - state.fixturesAt >= AlertPlanner.FIXTURE_REFRESH_MS) enqueueRefresh(context);
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

    private static boolean canExact(AlarmManager alarms) {
        if (Build.VERSION.SDK_INT < 31) return true;
        return alarms.canScheduleExactAlarms();
    }

    private static PendingIntent pending(Context context) {
        Intent intent = new Intent(context, WatchAlarmReceiver.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(context, 41, intent, flags);
    }
}

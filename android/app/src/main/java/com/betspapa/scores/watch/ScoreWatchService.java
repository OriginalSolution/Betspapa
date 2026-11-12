package com.betspapa.scores.watch;

import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import com.betspapa.watch.AlertPlanner;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Polls while a followed match is about to start or in play.
 * Stays in the foreground the whole time, including while the user is in the app,
 * so leaving the app or swiping it away does not have to start a service from the background.
 * The WebView is frozen in the background on Android 12+, so this does not use it.
 */
public class ScoreWatchService extends Service {
    static final String ACTION_POLL = "com.betspapa.scores.watch.POLL";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private PowerManager.WakeLock lock;
    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            io.execute(new Runnable() {
                @Override
                public void run() {
                    poll();
                }
            });
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        WatchRuntime.serviceRunning = true;
        AlertPoster.ensure(this);
        PowerManager power = (PowerManager) getSystemService(POWER_SERVICE);
        if (power != null) {
            lock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "betspapa:watch");
            lock.setReferenceCounted(false);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        WatchRuntime.serviceRunning = true;
        holdWake();
        if (!startInForeground()) {
            stopSelf();
            return START_NOT_STICKY;
        }
        handler.removeCallbacks(tick);
        handler.post(tick);
        return START_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // A swipe often kills the process immediately after this. The alarm is what brings the watcher back.
        WatchScheduler.arm(this);
        holdWake();
        startInForeground();
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(tick);
        io.shutdownNow();
        if (lock != null && lock.isHeld()) lock.release();
        WatchRuntime.serviceRunning = false;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void poll() {
        holdWake();
        final WatchRuntime.PollResult result = WatchRuntime.pollOnce(this);
        handler.post(new Runnable() {
            @Override
            public void run() {
                if (!result.hot) {
                    WatchScheduler.arm(ScoreWatchService.this);
                    stopWatching();
                    return;
                }
                startInForeground();
                handler.postDelayed(tick, result.nextDelayMs);
            }
        });
    }

    private void holdWake() {
        if (lock == null) return;
        lock.acquire(3L * 60L * 1000L);
    }

    private boolean startInForeground() {
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                try {
                    startForeground(
                        AlertPlanner.WATCH_NOTIFICATION_ID,
                        AlertPoster.watching(this),
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                    );
                } catch (RuntimeException specialUse) {
                    startForeground(
                        AlertPlanner.WATCH_NOTIFICATION_ID,
                        AlertPoster.watching(this),
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
                    );
                }
            } else {
                startForeground(AlertPlanner.WATCH_NOTIFICATION_ID, AlertPoster.watching(this));
            }
            return true;
        } catch (RuntimeException error) {
            return false;
        }
    }

    private void stopWatching() {
        handler.removeCallbacks(tick);
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }
}

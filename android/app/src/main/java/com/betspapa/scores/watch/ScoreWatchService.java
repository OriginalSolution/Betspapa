package com.betspapa.scores.watch;

import android.app.Service;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import com.betspapa.watch.AlertPlanner;
import com.betspapa.watch.WatchNote;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Polls while a followed match is about to start or in play.
 * The WebView is frozen in the background on Android 12+, so this does not use it.
 */
public class ScoreWatchService extends Service {
    static final String EXTRA_TEST_TITLE = "testTitle";
    static final String EXTRA_TEST_BODY = "testBody";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
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
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        WatchRuntime.serviceRunning = true;
        boolean soon = intent != null && intent.getBooleanExtra("soon", false);
        startInForeground(soon);
        if (isDebuggable() && intent != null && intent.hasExtra(EXTRA_TEST_TITLE)) {
            String title = intent.getStringExtra(EXTRA_TEST_TITLE);
            String body = intent.getStringExtra(EXTRA_TEST_BODY);
            if (title == null || title.isEmpty()) title = "Goal";
            if (body == null) body = "";
            AlertPoster.post(this, new WatchNote("qc:" + title, "qc", "goal", title, body));
            return START_NOT_STICKY;
        }
        if (WatchScheduler.isUiForeground()) {
            stopWatching();
            return START_NOT_STICKY;
        }
        handler.removeCallbacks(tick);
        handler.post(tick);
        return START_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        if (!WatchScheduler.isUiForeground()) handler.post(tick);
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(tick);
        io.shutdownNow();
        WatchRuntime.serviceRunning = false;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void poll() {
        if (WatchScheduler.isUiForeground()) {
            handler.post(new Runnable() {
                @Override
                public void run() {
                    stopWatching();
                }
            });
            return;
        }
        final WatchRuntime.PollResult result = WatchRuntime.pollOnce(this);
        handler.post(new Runnable() {
            @Override
            public void run() {
                if (WatchScheduler.isUiForeground() || !result.hot) {
                    WatchScheduler.arm(ScoreWatchService.this);
                    stopWatching();
                    return;
                }
                startInForeground(result.aboutToStart);
                handler.postDelayed(tick, result.nextDelayMs);
            }
        });
    }

    private void startInForeground(boolean aboutToStart) {
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(AlertPlanner.WATCH_NOTIFICATION_ID, AlertPoster.watching(this, aboutToStart), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else {
                startForeground(AlertPlanner.WATCH_NOTIFICATION_ID, AlertPoster.watching(this, aboutToStart));
            }
        } catch (RuntimeException error) {
            stopSelf();
        }
    }

    private void stopWatching() {
        handler.removeCallbacks(tick);
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private boolean isDebuggable() {
        return (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }
}

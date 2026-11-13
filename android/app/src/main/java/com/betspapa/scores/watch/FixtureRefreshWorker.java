package com.betspapa.scores.watch;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

/** One native poll-and-notify pass. Runs even when the foreground service has been killed. */
public class FixtureRefreshWorker extends Worker {
    public FixtureRefreshWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        WatchRuntime.PollResult result = WatchRuntime.pollOnce(context);
        if (!WatchRuntime.serviceRunning) {
            try {
                androidx.core.content.ContextCompat.startForegroundService(context, new android.content.Intent(context, ScoreWatchService.class));
            } catch (RuntimeException ignored) {
                /* the next watchdog alarm tries again */
            }
        }
        WatchScheduler.armWatchdog(context);
        return result.failed ? Result.retry() : Result.success();
    }
}

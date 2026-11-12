package com.betspapa.scores.watch;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

/** Slow fixture refresh. Live polls stay inside the foreground service. */
public class FixtureRefreshWorker extends Worker {
    public FixtureRefreshWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        if (!WatchRuntime.serviceRunning) WatchRuntime.pollOnce(context);
        if (!WatchScheduler.isUiForeground()) WatchScheduler.ensureWatching(context);
        WatchScheduler.arm(context);
        return Result.success();
    }
}

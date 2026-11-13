package com.betspapa.scores.watch;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        Context app = context.getApplicationContext();
        WatchScheduler.ensurePeriodic(app);
        WatchScheduler.armWatchdog(app);
        WatchScheduler.scheduleRestart(app);
        WatchScheduler.arm(app);
    }
}

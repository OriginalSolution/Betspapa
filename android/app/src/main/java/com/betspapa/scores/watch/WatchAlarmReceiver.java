package com.betspapa.scores.watch;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class WatchAlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        Context app = context.getApplicationContext();
        String action = intent == null ? "" : intent.getAction();
        if (WatchScheduler.ACTION_WATCHDOG.equals(action)) {
            WatchScheduler.onWatchdog(app);
            return;
        }
        if (WatchScheduler.ACTION_RESTART.equals(action)) {
            WatchScheduler.onWatchdog(app);
            return;
        }
        WatchScheduler.onAlarm(app);
    }
}

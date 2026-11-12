package com.betspapa.scores.watch;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class WatchAlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        WatchScheduler.onAlarm(context.getApplicationContext());
    }
}

package com.betspapa.scores.watch;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import com.betspapa.scores.R;
import com.betspapa.watch.WatchNote;

/** Posts the settings test alert even if the user has already closed Betspapa. */
public class TestAlertReceiver extends BroadcastReceiver {
    static final String EXTRA_SOUND = "goalSound";

    @Override
    public void onReceive(Context context, Intent intent) {
        Context app = context.getApplicationContext();
        AlertPoster.ensure(app);
        String sound = intent == null ? "crowd" : intent.getStringExtra(EXTRA_SOUND);
        if (sound == null || sound.isEmpty()) sound = "crowd";
        String title = app.getString(R.string.test_alert_title);
        String body = app.getString(R.string.test_alert_body);
        AlertPoster.post(app, new WatchNote("test:background:" + System.currentTimeMillis(), "", "goal", title, body), sound);
    }
}

package com.betspapa.scores.watch;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import com.betspapa.scores.R;
import com.betspapa.watch.WatchNote;

/** Posts the settings test alert even if the user has already closed Betspapa. */
public class TestAlertReceiver extends BroadcastReceiver {
    static final String EXTRA_SOUND = "goalSound";
    static final String EXTRA_KIND = "kind";

    @Override
    public void onReceive(Context context, Intent intent) {
        Context app = context.getApplicationContext();
        AlertPoster.ensure(app);
        String sound = intent == null ? "crowd" : intent.getStringExtra(EXTRA_SOUND);
        if (sound == null || sound.isEmpty()) sound = "crowd";
        String kind = intent == null ? "goal" : intent.getStringExtra(EXTRA_KIND);
        if (kind == null || kind.isEmpty()) kind = "goal";
        String title = app.getString(R.string.test_alert_title);
        String body = app.getString(R.string.test_alert_body);
        if ("red".equals(kind)) {
            title = "Red card";
            body = "Test red card sound";
        } else if ("var".equals(kind)) {
            title = "VAR";
            body = "Test VAR sound";
        } else if ("penalty".equals(kind)) {
            title = "Penalty";
            body = "Test penalty sound";
        } else if ("horn".equals(sound) || "arp".equals(sound)) {
            body = "horn".equals(sound) ? "Test horn" : "Test arpeggio";
        }
        AlertPoster.post(app, new WatchNote("test:" + kind + ":" + System.currentTimeMillis(), "", kind, title, body), sound);
    }
}

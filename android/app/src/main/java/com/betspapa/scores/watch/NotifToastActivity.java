package com.betspapa.scores.watch;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.widget.Toast;

/**
 * Notification actions start here so a toast is allowed.
 * Mute and copy still run in {@link NotificationActionReceiver}.
 */
public class NotifToastActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent incoming = getIntent();
        String action = incoming == null ? "" : incoming.getAction();
        String code = incoming == null ? "" : incoming.getStringExtra(NotificationActionReceiver.EXTRA_CODE);
        String matchId = incoming == null ? "" : incoming.getStringExtra(NotificationActionReceiver.EXTRA_MATCH);
        Intent relay = new Intent(this, NotificationActionReceiver.class);
        relay.setAction(action);
        if (code != null) relay.putExtra(NotificationActionReceiver.EXTRA_CODE, code);
        if (matchId != null) relay.putExtra(NotificationActionReceiver.EXTRA_MATCH, matchId);
        sendBroadcast(relay);
        String message = NotificationActionReceiver.ACTION_COPY.equals(action)
            ? "Copied " + (code == null ? "" : code)
            : "Alerts muted for this match";
        Toast.makeText(getApplicationContext(), message, Toast.LENGTH_LONG).show();
        new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
            @Override
            public void run() {
                finish();
                overridePendingTransition(0, 0);
            }
        }, 3500L);
    }
}

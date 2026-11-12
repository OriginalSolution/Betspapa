package com.betspapa.scores.watch;

import android.content.BroadcastReceiver;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.widget.Toast;
import com.betspapa.watch.WatchState;
import java.io.IOException;

/** Mute and copy actions from a notification. Copy also shows a toast. */
public class NotificationActionReceiver extends BroadcastReceiver {
    public static final String ACTION_MUTE = "com.betspapa.scores.notif.MUTE";
    public static final String ACTION_COPY = "com.betspapa.scores.notif.COPY";
    public static final String EXTRA_MATCH = "matchId";
    public static final String EXTRA_CODE = "code";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null || intent.getAction() == null) return;
        Context app = context.getApplicationContext();
        if (ACTION_MUTE.equals(intent.getAction())) {
            String matchId = intent.getStringExtra(EXTRA_MATCH);
            try {
                synchronized (WatchState.FILE_LOCK) {
                    WatchState state = WatchState.load(WatchFiles.file(app));
                    state.mute(matchId);
                    state.save(WatchFiles.file(app));
                }
            } catch (IOException ignored) {
                /* the next tap can try again */
            }
            toast(app, "Alerts muted for this match");
            return;
        }
        if (ACTION_COPY.equals(intent.getAction())) {
            String code = intent.getStringExtra(EXTRA_CODE);
            if (code == null || code.trim().isEmpty()) return;
            ClipboardManager clipboard = (ClipboardManager) app.getSystemService(Context.CLIPBOARD_SERVICE);
            if (clipboard != null) clipboard.setPrimaryClip(ClipData.newPlainText("Booking code", code.trim()));
            toast(app, "Copied " + code.trim());
        }
    }

    private static void toast(Context context, String message) {
        try {
            Toast.makeText(context, message, Toast.LENGTH_SHORT).show();
        } catch (RuntimeException ignored) {
            /* a clipboard copy still stands if the shade blocks the toast */
        }
    }
}

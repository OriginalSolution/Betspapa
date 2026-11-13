package com.betspapa.scores.watch;

import com.betspapa.watch.WatchNote;
import com.betspapa.watch.WatchState;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.io.IOException;
import java.util.Map;

/**
 * Foreground and data messages are posted on the sound channel the server named.
 * A background notification message is shown by the system on that same channel.
 * The note id is marked sent so the local poller does not raise it again.
 */
public class BetspapaFirebaseService extends FirebaseMessagingService {
    @Override
    public void onNewToken(String token) {
        PushBridge.remember(this, token);
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        Map<String, String> data = message.getData();
        String id = data.get("id");
        if (id == null || id.isEmpty()) return;
        String kind = data.get("kind");
        if (kind == null || kind.isEmpty()) kind = "goal";
        String title = data.get("title");
        String body = data.get("body");
        if ((title == null || title.isEmpty()) && message.getNotification() != null) title = message.getNotification().getTitle();
        if ((body == null || body.isEmpty()) && message.getNotification() != null) body = message.getNotification().getBody();
        synchronized (WatchState.FILE_LOCK) {
            WatchState state = WatchState.load(WatchFiles.file(this));
            if (state.sent.contains(id) || state.seen(id)) return;
            WatchNote note = new WatchNote(id, data.get("matchId"), kind, title == null ? "Betspapa" : title, body == null ? "" : body);
            state.record(note, System.currentTimeMillis());
            state.markSent(id);
            try {
                state.save(WatchFiles.file(this));
            } catch (IOException ignored) {
                /* the shade alert still posts if the seen-file cannot be written */
            }
            String sound = state.goalSound == null || state.goalSound.isEmpty() ? "crowd" : state.goalSound;
            AlertPoster.post(this, note, sound);
        }
    }
}

package com.betspapa.scores.watch;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import com.betspapa.scores.R;
import com.betspapa.watch.WatchMatch;
import com.betspapa.watch.WatchNote;
import com.betspapa.watch.WatchState;
import java.net.HttpURLConnection;
import java.net.URL;

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
        if ("promo".equals(kind)) {
            PendingResult pending = goAsync();
            String soundFinal = sound;
            new Thread(() -> {
                try {
                    postPromo(app, intent, soundFinal);
                } finally {
                    pending.finish();
                }
            }, "promo-qc").start();
            return;
        }
        if (intent != null && intent.getStringExtra("home") != null) {
            postScore(app, intent, kind, sound);
            return;
        }
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

    /** A data-only style goal card: crests, score, and the chosen sound. The same id replaces, it does not stack. */
    private static void postScore(Context app, Intent intent, String kind, String sound) {
        String matchId = text(intent, "matchId", "qc-match");
        String home = text(intent, "home", "Home");
        String away = text(intent, "away", "Away");
        WatchMatch match = new WatchMatch();
        match.id = matchId;
        match.home = home;
        match.away = away;
        match.homeFull = home;
        match.awayFull = away;
        match.homeCrest = text(intent, "homeCrest", "");
        match.awayCrest = text(intent, "awayCrest", "");
        match.competition = text(intent, "competition", "Premier League");
        match.status = "live";
        match.minute = intExtra(intent, "minute", 54);
        match.homeScore = intExtra(intent, "homeScore", 1);
        match.awayScore = intExtra(intent, "awayScore", 0);
        try {
            synchronized (WatchState.FILE_LOCK) {
                WatchState state = WatchState.load(WatchFiles.file(app));
                WatchMatch prior = null;
                for (WatchMatch item : state.matches) {
                    if (matchId.equals(item.id)) prior = item;
                }
                if (prior == null) state.matches.add(match);
                else {
                    prior.home = match.home;
                    prior.away = match.away;
                    prior.homeFull = match.homeFull;
                    prior.awayFull = match.awayFull;
                    prior.homeCrest = match.homeCrest;
                    prior.awayCrest = match.awayCrest;
                    prior.homeScore = match.homeScore;
                    prior.awayScore = match.awayScore;
                    prior.minute = match.minute;
                    prior.status = match.status;
                    prior.competition = match.competition;
                }
                state.goalSound = sound;
                state.save(WatchFiles.file(app));
            }
        } catch (Exception ignored) {
            /* the card still posts if the seen file cannot be written */
        }
        String id = text(intent, "id", "qc-goal");
        WatchNote note = new WatchNote(id, matchId, kind, "Goal · " + home, home + " " + match.homeScore + "–" + match.awayScore + " " + away);
        note.minute = match.minute;
        AlertPoster.post(app, note, sound);
    }

    /** Big-picture promo from a data-only payload. Works after the process has been killed. */
    private static void postPromo(Context app, Intent intent, String sound) {
        String id = text(intent, "id", "qc-promo");
        String title = text(intent, "title", "Betspapa");
        String body = text(intent, "body", "");
        String code = text(intent, "code", "");
        String route = text(intent, "route", "today");
        String matchId = text(intent, "matchId", "");
        Bitmap picture = download(text(intent, "image", ""));
        WatchNote note = new WatchNote(id, matchId, "promo", title, body);
        AlertPoster.postPromo(app, note, sound, picture, code, route);
    }

    private static Bitmap download(String url) {
        if (url.isEmpty() || !(url.startsWith("https://") || url.startsWith("http://"))) return null;
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(12000);
            return BitmapFactory.decodeStream(connection.getInputStream());
        } catch (Exception ignored) {
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static String text(Intent intent, String key, String fallback) {
        if (intent == null) return fallback;
        String value = intent.getStringExtra(key);
        return value == null || value.isEmpty() ? fallback : value;
    }

    private static int intExtra(Intent intent, String key, int fallback) {
        if (intent == null || !intent.hasExtra(key)) return fallback;
        return intent.getIntExtra(key, fallback);
    }
}

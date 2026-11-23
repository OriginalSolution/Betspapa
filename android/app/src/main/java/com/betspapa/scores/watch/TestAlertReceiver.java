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
                    AlertSound.await(8_000L);
                } finally {
                    pending.finish();
                }
            }, "promo-qc").start();
            return;
        }
        if (intent != null && intent.getStringExtra("home") != null) {
            postScore(app, intent, kind, sound);
            holdForSound();
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
        WatchMatch shown = sampleMatch(kind);
        WatchNote note = new WatchNote("test:" + kind + ":" + System.currentTimeMillis(), "", kind, title, body);
        // The card shows a sample match so the test looks like a real alert, not a blank Home / Away board.
        note.player = sampleLine(kind);
        AlertPoster.post(app, note, sound, 0, false, shown);
        holdForSound();
    }

    /** Sample fixture for the test card. It is never saved, so no live card or follow is created. */
    static WatchMatch sampleMatch(String kind) {
        WatchMatch match = new WatchMatch();
        match.id = "";
        match.home = "Hearts of Oak";
        match.away = "Asante Kotoko";
        match.homeFull = "Hearts of Oak";
        match.awayFull = "Asante Kotoko";
        match.homeAbbr = "HEA";
        match.awayAbbr = "KOT";
        match.homeColor = "#e11d2e";
        match.awayColor = "#f5c518";
        match.competition = "Ghana Premier League";
        match.status = "live";
        match.minute = 54;
        match.homeScore = 1;
        match.awayScore = 0;
        match.setGoal("home", 1, 54, "HEA", "", false);
        if ("red".equals(kind)) match.addMarker("red", 54, "KOT");
        return match;
    }

    static String sampleLine(String kind) {
        if ("red".equals(kind)) return "Test red card · background alerts work";
        if ("var".equals(kind)) return "Test VAR check · background alerts work";
        if ("penalty".equals(kind)) return "Test penalty · background alerts work";
        return "Test goal · background alerts work";
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
        com.betspapa.watch.NoteCopy.Copy copy = com.betspapa.watch.NoteCopy.goal(match, "home", text(intent, "player", ""), match.minute);
        WatchNote note = new WatchNote(id, matchId, kind, copy.title, copy.body);
        note.minute = match.minute;
        AlertPoster.post(app, note, sound);
    }

    /** HyperOS kills a receiver as soon as it returns, which cuts the cheer off. */
    private void holdForSound() {
        if (!AlertSound.isPlaying()) return;
        PendingResult pending = goAsync();
        new Thread(() -> {
            try {
                AlertSound.await(8_000L);
            } finally {
                pending.finish();
            }
        }, "alert-sound").start();
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

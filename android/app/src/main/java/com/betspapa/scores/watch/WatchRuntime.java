package com.betspapa.scores.watch;

import android.content.Context;
import android.os.PowerManager;
import com.betspapa.watch.AlertPlanner;
import com.betspapa.watch.MatchFeeds;
import com.betspapa.watch.MatchParser;
import com.betspapa.watch.WatchMatch;
import com.betspapa.watch.WatchNote;
import com.betspapa.watch.WatchState;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

/** One poll of Betspapa fixtures. The full list is not fetched on the live interval. */
final class WatchRuntime {
    static final AtomicBoolean BUSY = new AtomicBoolean(false);
    static volatile boolean serviceRunning;

    private WatchRuntime() {}

    static final class PollResult {
        final boolean hot;
        final boolean aboutToStart;
        final long nextDelayMs;
        final boolean failed;

        PollResult(boolean hot, boolean aboutToStart, long nextDelayMs) {
            this(hot, aboutToStart, nextDelayMs, false);
        }

        PollResult(boolean hot, boolean aboutToStart, long nextDelayMs, boolean failed) {
            this.hot = hot;
            this.aboutToStart = aboutToStart;
            this.nextDelayMs = nextDelayMs;
            this.failed = failed;
        }
    }

    static PollResult pollOnce(Context context) {
        Context app = context.getApplicationContext();
        if (!BUSY.compareAndSet(false, true)) {
            return new PollResult(true, false, AlertPlanner.POLL_MS);
        }
        PowerManager.WakeLock lock = wakeLock(app);
        try {
            WatchState snapshot = WatchState.load(WatchFiles.file(app));
            if (!snapshot.browser || !snapshot.hasInterest()) return new PollResult(false, false, AlertPlanner.FIXTURE_REFRESH_MS);
            long now = System.currentTimeMillis();
            boolean stale = snapshot.fixturesAt == 0L || now - snapshot.fixturesAt >= AlertPlanner.FIXTURE_REFRESH_MS;
            List<WatchMatch> fixtures = null;
            boolean networkFailed = false;
            if (stale) {
                fixtures = readFixtures(app);
                if (fixtures == null) networkFailed = true;
            }
            boolean hot = AlertPlanner.shouldWatch(snapshot.matches, snapshot, now);
            List<WatchMatch> live = null;
            if (hot || (fixtures != null && mightWatch(snapshot, fixtures, now))) {
                live = readLive(app);
                if (live == null) networkFailed = true;
            }
            // Live matches that dropped out of the in-play list late in the game: ask whether they ended,
            // so full time and full-time trends settle now instead of 130 minutes after kick-off.
            java.util.Map<String, org.json.JSONObject> ended = new java.util.HashMap<String, org.json.JSONObject>();
            if (live != null && !live.isEmpty()) {
                int asked = 0;
                for (String id : snapshot.vanishedLate(live)) {
                    if (asked++ >= 3) break;
                    org.json.JSONObject detail = readDetail(app, id);
                    if (detail != null) ended.put(id, detail);
                }
            }
            List<WatchNote> pending;
            boolean aboutToStart;
            String goalSound = "crowd";
            synchronized (WatchState.FILE_LOCK) {
                WatchState state = WatchState.load(WatchFiles.file(app));
                now = System.currentTimeMillis();
                if (!state.browser || !state.hasInterest()) return new PollResult(false, false, AlertPlanner.FIXTURE_REFRESH_MS);
                if (fixtures != null && !fixtures.isEmpty()) state.replaceFromFeed(fixtures, now);
                if (live != null) state.overlayLive(live, now);
                for (java.util.Map.Entry<String, org.json.JSONObject> entry : ended.entrySet()) {
                    org.json.JSONObject detail = entry.getValue();
                    Integer[] score = score(detail.optString("setScore", ""));
                    state.finishFromDetail(entry.getKey(), detail.optString("matchStatus", ""), detail.optInt("status", -1), score[0], score[1]);
                }
                // After a long doze the phone would otherwise post every goal of the last hour at once.
                boolean slept = state.lastPollAt > 0L && now - state.lastPollAt > SLEPT_MS;
                for (WatchNote note : AlertPlanner.notices(state.matches, state, now)) {
                    state.record(note, now);
                    if (slept && AlertGate.stale(note.kind, now - state.lastPollAt)) state.markSent(note.id);
                }
                state.commitScores();
                if (!networkFailed) state.lastPollAt = now;
                state.save(WatchFiles.file(app));
                pending = new ArrayList<WatchNote>();
                for (WatchNote note : state.pendingNotifications()) {
                    if (state.muted(note.matchId)) {
                        state.markSent(note.id);
                        continue;
                    }
                    pending.add(note);
                }
                hot = AlertPlanner.shouldWatch(state.matches, state, now);
                aboutToStart = hot && !inPlay(state, now);
                goalSound = state.goalSound == null || state.goalSound.isEmpty() ? "crowd" : state.goalSound;
            }
            // HiOS freezes the WebView without pausing the activity, and it does the same
            // when the user is in another app. Substituting "off" posted the alert on the
            // silent channel, which is why the shade showed a goal with no cheer.
            // The file's goalSound is what plays. The page does not also play a copy.
            for (WatchNote note : pending) {
                if (!AlertGate.claim(app, note.id)) continue;
                boolean posted = false;
                try {
                    posted = AlertPoster.post(app, note, goalSound);
                } finally {
                    AlertGate.finish(app, note.id, posted);
                }
            }
            long delay = inPlayAfter(app) ? AlertPlanner.POLL_MS : 60_000L;
            return new PollResult(hot, aboutToStart, delay, networkFailed);
        } catch (IOException error) {
            WatchState state = WatchState.load(WatchFiles.file(app));
            boolean hot = state.browser && state.hasInterest() && AlertPlanner.shouldWatch(state.matches, state, System.currentTimeMillis());
            return new PollResult(hot, false, 60_000L, true);
        } finally {
            try {
                AlertPoster.settleDisallowed(app);
                AlertPoster.refreshLive(app);
                ScoreWidget.nudge(app);
            } catch (RuntimeException ignored) {
                /* a card failure must not stop the next poll */
            }
            if (lock != null && lock.isHeld()) lock.release();
            BUSY.set(false);
        }
    }

    private static boolean mightWatch(WatchState state, List<WatchMatch> fixtures, long now) {
        WatchState copy = new WatchState();
        copy.teamIds.addAll(state.teamIds);
        copy.matchIds.addAll(state.matchIds);
        copy.trends.addAll(state.trends);
        return AlertPlanner.shouldWatch(fixtures, copy, now);
    }

    private static boolean inPlay(WatchState state, long now) {
        for (WatchMatch match : state.matches) {
            if (!state.relevant(match)) continue;
            if ("live".equals(match.status) || "halftime".equals(match.status)) return true;
            if (!"finished".equals(match.status) && !"postponed".equals(match.status) && match.kickoffMs > 0 && now >= match.kickoffMs) return true;
        }
        return false;
    }

    private static boolean inPlayAfter(Context context) {
        WatchState state = WatchState.load(WatchFiles.file(context));
        return inPlay(state, System.currentTimeMillis());
    }

    private static List<WatchMatch> readFixtures(Context context) {
        try {
            return MatchParser.parseUpcoming(FeedClient.get(context, MatchFeeds.FIXTURES));
        } catch (IOException error) {
            return null;
        }
    }

    static final long SLEPT_MS = 15L * 60L * 1000L;
    static final String EVENT_DETAIL = "https://www.sportybet.com/api/gh/factsCenter/event?eventId=";

    private static org.json.JSONObject readDetail(Context context, String eventId) {
        try {
            String body = FeedClient.get(context, EVENT_DETAIL + java.net.URLEncoder.encode(eventId, "UTF-8"));
            org.json.JSONObject json = new org.json.JSONObject(body);
            return json.optJSONObject("data");
        } catch (Exception error) {
            return null;
        }
    }

    static Integer[] score(String text) {
        Integer[] out = new Integer[] {null, null};
        if (text == null) return out;
        java.util.regex.Matcher match = java.util.regex.Pattern.compile("^\\s*(\\d+)\\s*[:\\-]\\s*(\\d+)\\s*$").matcher(text);
        if (!match.matches()) return out;
        out[0] = Integer.valueOf(match.group(1));
        out[1] = Integer.valueOf(match.group(2));
        return out;
    }

    private static List<WatchMatch> readLive(Context context) {
        try {
            return MatchParser.parseLive(FeedClient.get(context, MatchFeeds.LIVE));
        } catch (IOException error) {
            return null;
        }
    }

    private static PowerManager.WakeLock wakeLock(Context context) {
        PowerManager manager = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        if (manager == null) return null;
        PowerManager.WakeLock lock = manager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "betspapa:watch");
        lock.setReferenceCounted(false);
        lock.acquire(4L * 60L * 1000L);
        return lock;
    }
}

package com.betspapa.watch;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.List;
import org.json.JSONObject;
import org.junit.Test;

public class AlertPlannerTest {
    private static final long KICK = 1794326400000L;

    @Test
    public void goalSoundKeepsCrowdChantAndOff() {
        WatchState state = new WatchState();
        assertEquals("crowd", state.goalSound);
        state.merge(settingsSound("cheer"));
        assertEquals("crowd", state.goalSound);
        state.merge(settingsSound("chant"));
        assertEquals("chant", state.goalSound);
        state.merge(settingsSound("off"));
        assertEquals("off", state.goalSound);
        state.merge(settingsSound("afro"));
        assertEquals("afro", state.goalSound);
        state.merge(settingsSound("latin"));
        assertEquals("afro", state.goalSound);
        assertEquals("afro", state.toJson().getJSONObject("settings").getString("goalSound"));
    }

    private static JSONObject settingsSound(String sound) {
        JSONObject settings = new JSONObject();
        settings.put("goalSound", sound);
        JSONObject patch = new JSONObject();
        patch.put("settings", settings);
        return patch;
    }

    @Test
    public void slugAndNotificationIdMatchTheWebView() {
        assertEquals("al-astiklal", AlertPlanner.slug("Al Astiklal"));
        assertEquals("nashama-al-mustaqbal", AlertPlanner.slug("Nashama Al-Mustaqbal"));
        assertEquals("man-city", AlertPlanner.slug("Man City"));
        assertEquals(1447188625, AlertPlanner.notificationId("sr:match:1:kickoff"));
        assertTrue(AlertPlanner.notificationId("sr:match:1:goal:home:1") < AlertPlanner.WATCH_NOTIFICATION_ID);
    }

    @Test
    public void clockParsesKickoffWithoutInventingAZone() {
        assertEquals(KICK, WatchClock.parseIso("2026-11-10T16:00:00.000Z"));
    }

    @Test
    public void headersDoNotSendOriginOrNameAnotherFeed() {
        assertFalse(MatchFeeds.headers().containsKey("Origin"));
        assertFalse(MatchFeeds.headers().containsKey("origin"));
        assertFalse(MatchFeeds.headers().containsKey("Referer"));
        assertFalse(MatchFeeds.FIXTURES.toLowerCase().contains("sofascore"));
        assertFalse(MatchFeeds.LIVE.toLowerCase().contains("sofascore"));
        assertEquals("Betspapa fixtures", MatchFeeds.SOURCE_LABEL);
        assertEquals("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36", MatchFeeds.headers().get("User-Agent"));
    }

    @Test
    public void kickoffGoalHalfAndFullTimeFireOnce() {
        WatchState state = followed();
        WatchMatch scheduled = match();
        long kickoffAt = KICK + 60_000L;
        List<WatchNote> kickoff = AlertPlanner.notices(java.util.Collections.singletonList(scheduled), state, kickoffAt);
        assertEquals("kickoff", kinds(kickoff));
        assertTrue(kickoff.get(0).body.contains("Al Astiklal"));
        state.record(kickoff.get(0), kickoffAt);
        assertTrue(AlertPlanner.notices(java.util.Collections.singletonList(scheduled), state, kickoffAt).isEmpty());

        WatchMatch live = match();
        live.status = "live";
        live.minute = 76;
        live.homeScore = 1;
        live.awayScore = 0;
        live.htHome = 0;
        live.htAway = 0;
        String kinds = kinds(AlertPlanner.notices(java.util.Collections.singletonList(live), state, KICK + 80 * 60_000L));
        assertTrue(kinds.contains("goal"));
        assertTrue(kinds.contains("ht"));
        assertFalse(kinds.contains("var"));
        for (WatchNote note : AlertPlanner.notices(java.util.Collections.singletonList(live), state, KICK + 80 * 60_000L)) state.record(note, KICK);
        assertTrue(AlertPlanner.notices(java.util.Collections.singletonList(live), state, KICK + 80 * 60_000L).isEmpty());

        WatchMatch done = live.copy();
        done.status = "finished";
        done.minute = 90;
        List<WatchNote> full = AlertPlanner.notices(java.util.Collections.singletonList(done), state, KICK + 100 * 60_000L);
        assertEquals("ft", kinds(full));
        assertTrue(full.get(0).body.contains("1" + "\u2013" + "0"));
    }

    @Test
    public void goalsDiffAgainstTheLastConfirmedScore() {
        WatchState state = followed();
        WatchMatch live = match();
        live.status = "live";
        live.minute = 20;
        live.homeScore = 1;
        live.awayScore = 0;
        live.seenHome = 0;
        live.seenAway = 0;
        List<WatchNote> first = AlertPlanner.notices(java.util.Collections.singletonList(live), state, KICK + 20 * 60_000L);
        assertTrue(kinds(first).contains("goal"));
        assertFalse(kinds(first).contains("var"));
        for (WatchNote note : first) state.record(note, KICK);
        state.commitScores();
        live.seenHome = 1;
        assertFalse(kinds(AlertPlanner.notices(java.util.Collections.singletonList(live), state, KICK + 21 * 60_000L)).contains("goal"));

        live.homeScore = 2;
        List<WatchNote> next = AlertPlanner.notices(java.util.Collections.singletonList(live), state, KICK + 30 * 60_000L);
        int goals = 0;
        boolean second = false;
        for (WatchNote note : next) {
            if (!"goal".equals(note.kind)) continue;
            goals++;
            if (note.id.endsWith(":goal:home:2")) second = true;
        }
        assertEquals(1, goals);
        assertTrue(second);
    }

    @Test
    public void varHoldsTheGoalOnThatSideUntilTheReviewClears() {
        WatchState state = followed();
        WatchMatch live = match();
        live.status = "live";
        live.minute = 22;
        live.homeScore = 1;
        live.awayScore = 0;
        live.seenHome = 0;
        live.seenAway = 0;
        WatchMatch.VarReview review = new WatchMatch.VarReview();
        review.teamId = live.homeId;
        review.player = "Striker";
        review.minute = 22;
        live.varReview = review;
        String during = kinds(AlertPlanner.notices(java.util.Collections.singletonList(live), state, KICK + 22 * 60_000L));
        assertTrue(during.contains("var"));
        assertFalse(during.contains("goal"));
        state.matches.add(live);
        state.commitScores();
        assertEquals(Integer.valueOf(0), live.seenHome);

        live.varReview = null;
        List<WatchNote> after = AlertPlanner.notices(java.util.Collections.singletonList(live), state, KICK + 24 * 60_000L);
        assertTrue(kinds(after).contains("goal"));
        assertFalse(kinds(after).contains("var"));
    }

    @Test
    public void liveCountIgnoresMatchesThatAreNotInPlay() {
        WatchState state = followed();
        WatchMatch soon = match();
        assertEquals(0, AlertPlanner.liveCount(java.util.Collections.singletonList(soon), state));
        WatchMatch live = match();
        live.status = "live";
        assertEquals(1, AlertPlanner.liveCount(java.util.Collections.singletonList(live), state));
    }

    @Test
    public void varIsSentOnlyWhenAReviewIsPresent() {
        WatchState state = followed();
        WatchMatch quiet = match();
        quiet.status = "live";
        quiet.minute = 22;
        quiet.homeScore = 0;
        quiet.awayScore = 0;
        WatchMatch.VarReview review = new WatchMatch.VarReview();
        review.teamId = quiet.homeId;
        review.player = "Striker";
        review.minute = 22;
        quiet.varReview = review;
        List<WatchNote> during = AlertPlanner.notices(java.util.Collections.singletonList(quiet), state, KICK + 22 * 60_000L);
        assertEquals("kickoff var", kinds(during));
        assertTrue(during.get(1).body.contains("Striker"));
        assertTrue(during.get(1).body.contains("under review"));
        for (WatchNote note : during) state.record(note, KICK);

        WatchMatch scored = quiet.copy();
        scored.varReview = null;
        scored.homeScore = 1;
        scored.minute = 24;
        List<WatchNote> goal = AlertPlanner.notices(java.util.Collections.singletonList(scored), state, KICK + 24 * 60_000L);
        assertEquals("goal", kinds(goal));
        assertFalse(kinds(goal).contains("var"));
    }

    @Test
    public void trendHitsCoverTheMajorMarketsOnce() {
        WatchMatch live = match();
        live.status = "live";
        live.minute = 76;
        live.homeScore = 1;
        live.awayScore = 0;
        live.htHome = 0;
        live.htAway = 0;
        assertEquals("won", AlertPlanner.settle("over05", live));
        assertEquals("open", AlertPlanner.settle("over15", live));
        assertEquals("won", AlertPlanner.settle("fh-draw", live));
        assertEquals("bust", AlertPlanner.settle("fh-home", live));
        assertEquals("open", AlertPlanner.settle("home", live));
        assertEquals("open", AlertPlanner.settle("btts", live));
        assertEquals("open", AlertPlanner.settle("over05", match()));
        WatchMatch finished = live.copy();
        finished.status = "finished";
        assertEquals("won", AlertPlanner.settle("dnb-home", finished));
        WatchMatch drawn = finished.copy();
        drawn.homeScore = 1;
        drawn.awayScore = 1;
        assertEquals("won", AlertPlanner.settle("dc-1x", drawn));

        WatchState state = followed();
        state.trends.add(live.id + ":over05");
        state.trends.add(live.id + ":over15");
        state.trends.add(live.id + ":home");
        List<WatchNote> notes = AlertPlanner.notices(java.util.Collections.singletonList(live), state, KICK + 80 * 60_000L);
        int hits = 0;
        for (WatchNote note : notes) {
            if (!"win".equals(note.kind)) continue;
            hits += 1;
            assertTrue(note.title.contains("Over 0.5 goals"));
            assertTrue(note.body.contains("Al Astiklal"));
            assertFalse(note.title.toLowerCase().contains("sportybet"));
            assertFalse(note.body.toLowerCase().contains("sofascore"));
        }
        assertEquals(1, hits);
        for (WatchNote note : notes) state.record(note, KICK);
        assertTrue(AlertPlanner.notices(java.util.Collections.singletonList(live), state, KICK + 80 * 60_000L).isEmpty());
    }

    @Test
    public void idleMatchesDoNotNeedALivePoll() {
        WatchState state = followed();
        WatchMatch later = match();
        long now = KICK - 2 * 60L * 60L * 1000L;
        assertFalse(AlertPlanner.shouldWatch(java.util.Collections.singletonList(later), state, now));
        assertEquals(KICK - AlertPlanner.LEAD_MS, AlertPlanner.nextWake(java.util.Collections.singletonList(later), state, now));
        assertTrue(AlertPlanner.notices(java.util.Collections.singletonList(later), state, now).isEmpty());

        long soon = KICK - 10 * 60L * 1000L;
        assertTrue(AlertPlanner.shouldWatch(java.util.Collections.singletonList(later), state, soon));

        WatchMatch old = match();
        old.status = "finished";
        old.homeScore = 2;
        old.awayScore = 0;
        old.minute = 90;
        long after = KICK + 4 * 60L * 60L * 1000L;
        assertFalse(AlertPlanner.shouldWatch(java.util.Collections.singletonList(old), state, after));
        assertTrue(AlertPlanner.notices(java.util.Collections.singletonList(old), state, after).isEmpty());
    }

    @Test
    public void parserReadsScoresAndIgnoresAMissingReview() throws Exception {
        String upcoming = "{\"events\":[{\"eventId\":\"sr:match:1\",\"home\":\"Al Astiklal\",\"away\":\"Nashama Al-Mustaqbal\",\"kickoff\":\"2026-11-10T16:00:00.000Z\",\"tournament\":\"Cup\"}]}";
        WatchMatch fixture = MatchParser.parseUpcoming(upcoming).get(0);
        assertEquals("al-astiklal", fixture.homeId);
        assertEquals(KICK, fixture.kickoffMs);
        assertEquals("scheduled", fixture.status);

        String live = "{\"data\":[{\"name\":\"Cup\",\"events\":[{\"eventId\":\"sr:match:1\",\"homeTeamName\":\"Al Astiklal\",\"awayTeamName\":\"Nashama Al-Mustaqbal\",\"estimateStartTime\":" + KICK + ",\"status\":1,\"matchStatus\":\"H2\",\"period\":\"2\",\"playedSeconds\":\"76:12\",\"setScore\":\"1:0\",\"gameScore\":[\"0:0\",\"1:0\"]}]}]}";
        WatchMatch scored = MatchParser.parseLive(live).get(0);
        assertEquals("live", scored.status);
        assertEquals(Integer.valueOf(1), scored.homeScore);
        assertEquals(Integer.valueOf(0), scored.htHome);
        assertEquals(Integer.valueOf(76), scored.minute);
        assertNull(scored.varReview);

        String reviewed = live.replace("\"setScore\"", "\"varReview\":{\"teamId\":\"al-astiklal\",\"player\":\"Striker\",\"minute\":76},\"setScore\"");
        assertEquals("al-astiklal", MatchParser.parseLive(reviewed).get(0).varReview.teamId);
        assertTrue(MatchParser.parseLive("{\"data\":[{\"events\":[{\"eventId\":\"v\",\"homeTeamName\":\"Simulated Home\",\"awayTeamName\":\"Away\",\"matchStatus\":\"H1\",\"status\":1}]}]}").isEmpty());
    }

    @Test
    public void handoffKeepsNativeAlertsWhenTheAppSyncsAnOlderInbox() throws Exception {
        WatchState state = followed();
        WatchMatch live = match();
        live.status = "live";
        live.minute = 12;
        live.homeScore = 1;
        live.awayScore = 0;
        for (WatchNote note : AlertPlanner.notices(java.util.Collections.singletonList(live), state, KICK + 12 * 60_000L)) {
            state.record(note, KICK);
            state.markSent(note.id);
        }
        assertTrue(state.pendingNotifications().isEmpty());

        JSONObject patch = new JSONObject();
        patch.put("seen", new org.json.JSONArray().put("sr:match:1:kickoff"));
        patch.put("inbox", new org.json.JSONArray());
        patch.put("sent", new org.json.JSONArray());
        state.merge(patch);
        assertTrue(state.seen("sr:match:1:goal:home:1"));
        assertTrue(state.sent.contains("sr:match:1:goal:home:1"));
        assertEquals(2, state.inbox.size());

        JSONObject clear = new JSONObject();
        clear.put("inbox", new org.json.JSONArray());
        clear.put("replaceInbox", true);
        state.merge(clear);
        assertTrue(state.inbox.isEmpty());
        assertTrue(state.seen("sr:match:1:goal:home:1"));

        WatchState fresh = followed();
        WatchMatch scheduled = match();
        JSONObject schedule = new JSONObject();
        org.json.JSONArray rows = new org.json.JSONArray();
        JSONObject row = scheduled.toJson();
        row.put("status", "scheduled");
        row.put("homeScore", org.json.JSONObject.NULL);
        rows.put(row);
        schedule.put("schedule", rows);
        WatchMatch scored = scheduled.copy();
        scored.status = "live";
        scored.homeScore = 1;
        scored.awayScore = 0;
        fresh.matches.add(scored);
        fresh.merge(schedule);
        assertEquals("live", fresh.matches.get(0).status);
        assertEquals(Integer.valueOf(1), fresh.matches.get(0).homeScore);

        WatchState followedMatch = new WatchState();
        followedMatch.matchIds.add("sr:match:1");
        WatchMatch stored = match();
        stored.homeId = "custom-id";
        followedMatch.matches.add(stored);
        WatchMatch feed = match();
        feed.status = "live";
        feed.homeId = "different-slug";
        feed.homeScore = 2;
        feed.awayScore = 1;
        followedMatch.overlayLive(java.util.Collections.singletonList(feed), KICK + 1000L);
        assertEquals("live", followedMatch.matches.get(0).status);
        assertEquals(Integer.valueOf(2), followedMatch.matches.get(0).homeScore);
    }

    private static WatchState followed() {
        WatchState state = new WatchState();
        state.browser = true;
        state.teamIds.add("al-astiklal");
        return state;
    }

    private static WatchMatch match() {
        WatchMatch match = new WatchMatch();
        match.id = "sr:match:1";
        match.home = "Al Astiklal";
        match.away = "Nashama";
        match.homeId = "al-astiklal";
        match.awayId = "nashama";
        match.kickoffMs = KICK;
        match.status = "scheduled";
        return match;
    }

    private static String kinds(List<WatchNote> notes) {
        StringBuilder builder = new StringBuilder();
        for (WatchNote note : notes) {
            if (builder.length() > 0) builder.append(' ');
            builder.append(note.kind);
        }
        return builder.toString();
    }
}

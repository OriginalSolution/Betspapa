package com.betspapa.watch;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.io.FileOutputStream;
import java.util.List;
import org.json.JSONArray;
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
        state.merge(settingsSound("papa"));
        assertEquals("papa", state.goalSound);
        state.merge(settingsSound("horn"));
        assertEquals("horn", state.goalSound);
        state.merge(settingsSound("arp"));
        assertEquals("arp", state.goalSound);
        assertEquals("arp", state.toJson().getJSONObject("settings").getString("goalSound"));
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
        assertEquals("https://www.sportybet.com/gh/sport/football", MatchFeeds.headersFor(MatchFeeds.LIVE).get("Referer"));
        assertFalse(MatchFeeds.headersFor(MatchFeeds.LIVE).containsKey("Origin"));
        assertFalse(MatchFeeds.headersFor(MatchFeeds.FIXTURES).containsKey("Referer"));
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

        String mixed = "{\"data\":["
                + "{\"name\":\"UEFA Nations League SRL\",\"categoryName\":\"Simulated Reality League\",\"events\":[{\"eventId\":\"srl\",\"homeTeamName\":\"Andorra SRL\",\"awayTeamName\":\"Gibraltar SRL\",\"matchStatus\":\"H1\",\"status\":1}]},"
                + "{\"name\":\"eSoccer Battle\",\"categoryName\":\"Esports\",\"events\":[{\"eventId\":\"e\",\"homeTeamName\":\"Alpha\",\"awayTeamName\":\"Beta\",\"matchStatus\":\"H1\",\"status\":1}]},"
                + "{\"name\":\"Serie C, Group C\",\"categoryName\":\"Italy\",\"events\":[{\"eventId\":\"real\",\"homeTeamName\":\"Barletta Calcio\",\"awayTeamName\":\"Altamura Societa' Sportiva SRL\",\"matchStatus\":\"H1\",\"status\":1}]}"
                + "]}";
        java.util.List<WatchMatch> kept = MatchParser.parseLive(mixed);
        assertEquals(1, kept.size());
        assertEquals("real", kept.get(0).id);
        String upcomingSrl = "{\"events\":["
                + "{\"eventId\":\"srl\",\"home\":\"Andorra SRL\",\"away\":\"Gibraltar SRL\",\"kickoff\":\"2026-11-10T16:00:00.000Z\",\"tournament\":\"Premier League SRL\",\"country\":\"Simulated Reality League\"},"
                + "{\"eventId\":\"real\",\"home\":\"Barletta Calcio\",\"away\":\"Altamura Societa' Sportiva SRL\",\"kickoff\":\"2026-11-10T16:00:00.000Z\",\"tournament\":\"Serie C, Group C\",\"country\":\"Italy\"}"
                + "]}";
        java.util.List<WatchMatch> listed = MatchParser.parseUpcoming(upcomingSrl);
        assertEquals(1, listed.size());
        assertEquals("real", listed.get(0).id);
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

    @Test
    public void styleBookingAndGoalMarksSurvive() throws Exception {
        WatchState state = followed();
        assertEquals("auto", state.notificationStyle);
        JSONObject settings = new JSONObject();
        settings.put("notificationStyle", "light");
        JSONObject patch = new JSONObject();
        patch.put("settings", settings);
        JSONObject booked = new JSONObject();
        booked.put("id", "sr:match:1:over25");
        booked.put("marketLabel", "Over 2.5 goals");
        booked.put("odds", "1.72");
        booked.put("fixture", "AA vs NA");
        booked.put("bookId", "sportybet");
        booked.put("code", "N7KQ2X");
        patch.put("bookings", new JSONArray().put(booked));
        state.merge(patch);
        assertEquals("light", state.notificationStyle);
        state.trends.add("sr:match:1:over25");
        WatchMatch prior = match();
        prior.status = "live";
        prior.minute = 10;
        prior.homeScore = 0;
        prior.awayScore = 0;
        state.matches.add(prior);
        WatchMatch update = match();
        update.status = "finished";
        update.minute = 90;
        update.homeScore = 2;
        update.awayScore = 1;
        state.overlayLive(java.util.Collections.singletonList(update), KICK + 1000L);
        assertEquals("goal", state.matches.get(0).markers.get(0).type);
        assertEquals(90, state.matches.get(0).markers.get(0).minute);
        List<WatchNote> notes = AlertPlanner.notices(state.matches, state, KICK + 1000L);
        WatchNote hit = null;
        for (WatchNote note : notes) {
            if ("win".equals(note.kind)) hit = note;
        }
        assertTrue(hit != null);
        assertEquals("N7KQ2X", hit.bookCode);
        assertEquals("1.72", hit.oddsText);
        assertEquals("sportybet", hit.bookId);
        WatchState loaded = WatchState.fromJson(new JSONObject(state.toJson().toString()));
        assertEquals("light", loaded.notificationStyle);
        assertEquals("N7KQ2X", loaded.bookingFor("sr:match:1:over25").optString("code"));
        assertEquals("AA", WatchMatch.label("", "Al Astiklal"));
        assertEquals("ARS", WatchMatch.label("", "Arsenal"));
    }

    @Test
    public void scoreChangesKeepTheirMinuteThroughLaterPolls() throws Exception {
        WatchState state = new WatchState();
        state.matchIds.add("sr:match:gha");
        WatchMatch prior = ghana();
        prior.status = "live";
        prior.minute = 22;
        prior.homeScore = 0;
        prior.awayScore = 0;
        state.matches.add(prior);
        WatchMatch scored = ghana();
        scored.status = "live";
        scored.minute = 23;
        scored.homeScore = 1;
        scored.awayScore = 0;
        state.overlayLive(java.util.Collections.singletonList(scored), KICK);
        assertEquals(23, state.matches.get(0).markers.get(0).minute);
        assertEquals("GHA", state.matches.get(0).markers.get(0).abbr);
        assertEquals("home", state.matches.get(0).markers.get(0).side);
        WatchMatch later = ghana();
        later.status = "live";
        later.minute = 57;
        later.homeScore = 1;
        later.awayScore = 0;
        state.overlayLive(java.util.Collections.singletonList(later), KICK + 30_000L);
        assertEquals(1, state.matches.get(0).markers.size());
        assertEquals(23, state.matches.get(0).markers.get(0).minute);
        WatchState loaded = WatchState.fromJson(new JSONObject(state.toJson().toString()));
        assertEquals(23, loaded.matches.get(0).markers.get(0).minute);
        assertEquals("GHA", loaded.matches.get(0).markers.get(0).abbr);
    }

    @Test
    public void aScoreAlreadyOnTheBoardStillGetsTheCurrentMinute() {
        WatchState state = new WatchState();
        state.matchIds.add("sr:match:gha");
        WatchMatch live = ghana();
        live.status = "live";
        live.minute = 57;
        live.homeScore = 1;
        live.awayScore = 0;
        state.overlayLive(java.util.Collections.singletonList(live), KICK);
        assertEquals(57, state.matches.get(0).markers.get(0).minute);
        assertTrue(state.matches.get(0).markers.get(0).estimated);
        String feed = "{\"data\":[{\"events\":[{\"eventId\":\"sr:match:gha\",\"homeTeamName\":\"Ghana\",\"awayTeamName\":\"Somalia\",\"matchStatus\":\"H2\",\"playedSeconds\":\"57:00\",\"setScore\":\"1:0\",\"timeline\":[{\"type\":\"goal\",\"minute\":23,\"side\":\"home\",\"player\":\"Kudus\"}]}]}]}";
        WatchMatch parsed = MatchParser.parseLive(feed).get(0);
        assertEquals(23, parsed.markers.get(0).minute);
        assertEquals("Kudus", parsed.markers.get(0).player);
        assertFalse(parsed.markers.get(0).estimated);
    }

    @Test
    public void redAndPenaltyComeOnlyFromIncidents() {
        String bare = "{\"data\":[{\"events\":[{\"eventId\":\"sr:match:1\",\"homeTeamName\":\"Al Astiklal\",\"awayTeamName\":\"Nashama\",\"matchStatus\":\"H1\",\"playedSeconds\":\"40:00\",\"setScore\":\"0:0\"}]}]}";
        WatchMatch quiet = MatchParser.parseLive(bare).get(0);
        assertEquals(0, quiet.markers.size());
        String feed = "{\"data\":[{\"events\":[{\"eventId\":\"sr:match:1\",\"homeTeamName\":\"Al Astiklal\",\"awayTeamName\":\"Nashama\",\"matchStatus\":\"H1\",\"playedSeconds\":\"41:00\",\"setScore\":\"0:0\",\"timeline\":[{\"type\":\"red card\",\"minute\":38,\"side\":\"away\",\"player\":\"Keeper\"},{\"type\":\"penalty\",\"minute\":41,\"side\":\"home\",\"player\":\"Striker\"}]}]}]}";
        WatchMatch parsed = MatchParser.parseLive(feed).get(0);
        WatchState state = followed();
        List<WatchNote> notes = AlertPlanner.notices(java.util.Collections.singletonList(parsed), state, KICK + 41 * 60_000L);
        assertTrue(kinds(notes).contains("red"));
        assertTrue(kinds(notes).contains("penalty"));
        assertFalse(kinds(AlertPlanner.notices(java.util.Collections.singletonList(quiet), state, KICK + 40 * 60_000L)).contains("red"));
    }

    @Test
    public void trendHitsUnderOnePointTwoAreDropped() {
        assertTrue(AlertPlanner.belowFloor("1.19"));
        assertTrue(AlertPlanner.belowFloor("1.01"));
        assertTrue(AlertPlanner.belowFloor("1.04"));
        assertFalse(AlertPlanner.belowFloor("1.20"));
        assertFalse(AlertPlanner.belowFloor(""));
        WatchState state = new WatchState();
        state.browser = true;
        state.matchIds.add("sr:match:gha");
        state.trends.add("sr:match:gha:over25");
        WatchMatch done = ghana();
        done.status = "finished";
        done.minute = 90;
        done.homeScore = 2;
        done.awayScore = 1;
        state.matches.add(done);
        JSONObject shortPrice = new JSONObject();
        shortPrice.put("id", "sr:match:gha:over25");
        shortPrice.put("odds", "1.15");
        state.merge(new JSONObject().put("bookings", new JSONArray().put(shortPrice)));
        assertEquals("", kinds(AlertPlanner.notices(state.matches, state, KICK + 1000L)).replace("kickoff", "").replace("ht", "").replace("ft", "").replace("goal", "").trim());
        JSONObject priced = new JSONObject();
        priced.put("id", "sr:match:gha:over25");
        priced.put("odds", "1.20");
        state.merge(new JSONObject().put("bookings", new JSONArray().put(priced)));
        assertTrue(kinds(AlertPlanner.notices(state.matches, state, KICK + 1000L)).contains("win"));
    }

    @Test
    public void emptyOrBrokenWatchFileLoadsAsAFreshState() throws Exception {
        File empty = File.createTempFile("watch-empty", ".json");
        new FileOutputStream(empty).close();
        WatchState blank = WatchState.load(empty);
        assertEquals(0, blank.matches.size());
        assertEquals(0L, blank.lastPollAt);

        File broken = File.createTempFile("watch-broken", ".json");
        FileOutputStream output = new FileOutputStream(broken);
        output.write("{".getBytes("UTF-8"));
        output.close();
        WatchState fresh = WatchState.load(broken);
        assertEquals(0, fresh.matches.size());
        assertEquals(0L, fresh.lastPollAt);
    }

    private static WatchMatch ghana() {
        WatchMatch match = new WatchMatch();
        match.id = "sr:match:gha";
        match.home = "Ghana";
        match.away = "Somalia";
        match.homeId = "ghana";
        match.awayId = "somalia";
        match.kickoffMs = KICK;
        match.status = "scheduled";
        return match;
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

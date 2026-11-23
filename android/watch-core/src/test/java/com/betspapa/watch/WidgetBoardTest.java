package com.betspapa.watch;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

public class WidgetBoardTest {
    private static final long NOW = 1_800_000_000_000L;
    private static final long HOUR = 3_600_000L;

    private static WatchMatch match(String id, String home, String away, long kickoff, String status) {
        WatchMatch match = new WatchMatch();
        match.id = id;
        match.home = home;
        match.away = away;
        match.homeId = home.toLowerCase();
        match.awayId = away.toLowerCase();
        match.kickoffMs = kickoff;
        match.status = status;
        return match;
    }

    private static WatchState following(String... teams) {
        WatchState state = new WatchState();
        state.teamIds.addAll(Arrays.asList(teams));
        return state;
    }

    @Test
    public void liveFirstThenNextKickoffsForFollowedTeamsOnly() {
        WatchMatch later = match("m1", "Hearts", "Kotoko", NOW + 5 * HOUR, "scheduled");
        WatchMatch soon = match("m2", "Medeama", "Hearts", NOW + HOUR, "scheduled");
        WatchMatch live = match("m3", "Kotoko", "Aduana", NOW - HOUR, "live");
        live.minute = 61;
        WatchMatch other = match("m4", "Arsenal", "Chelsea", NOW + HOUR, "scheduled");
        WatchMatch old = match("m5", "Hearts", "Dreams", NOW - 3 * HOUR, "finished");
        WatchMatch far = match("m6", "Hearts", "Legon", NOW + 9 * 24 * HOUR, "scheduled");
        List<WatchMatch> rows = WidgetBoard.rows(Arrays.asList(later, soon, live, other, old, far), following("hearts", "kotoko"), NOW);
        assertEquals(3, rows.size());
        assertEquals("m3", rows.get(0).id);
        assertEquals("m2", rows.get(1).id);
        assertEquals("m1", rows.get(2).id);
        assertTrue(WidgetBoard.anyLive(rows));
    }

    @Test
    public void aLiveRecordBeatsAStaleFixtureAndKeepsItsCrest() {
        WatchMatch fixture = match("m1", "Hearts", "Kotoko", NOW - HOUR, "scheduled");
        fixture.homeCrest = "https://api.betspapa.com/crests/id/1.png";
        WatchMatch live = match("m1", "Hearts", "Kotoko", NOW - HOUR, "live");
        live.minute = 54;
        live.homeScore = 1;
        live.awayScore = 0;
        List<WatchMatch> merged = WidgetBoard.merge(Collections.singletonList(live), Collections.singletonList(fixture));
        assertEquals(1, merged.size());
        assertEquals("live", merged.get(0).status);
        assertEquals("https://api.betspapa.com/crests/id/1.png", merged.get(0).homeCrest);
        assertEquals("1 \u2013 0", WidgetBoard.score(merged.get(0)));
        assertEquals("54\u2032", WidgetBoard.minute(merged.get(0)));
    }

    @Test
    public void followedMatchIdsCountAndNothingFollowedIsEmpty() {
        WatchMatch game = match("m9", "Arsenal", "Chelsea", NOW + HOUR, "scheduled");
        WatchState byMatch = new WatchState();
        byMatch.matchIds.add("m9");
        assertEquals(1, WidgetBoard.rows(Collections.singletonList(game), byMatch, NOW).size());
        assertTrue(WidgetBoard.rows(Collections.singletonList(game), new WatchState(), NOW).isEmpty());
        assertFalse(WidgetBoard.anyLive(Collections.<WatchMatch>emptyList()));
    }

    @Test
    public void halfTimeAndScheduledLabels() {
        WatchMatch ht = match("m1", "A", "B", NOW, "halftime");
        assertEquals("HT", WidgetBoard.minute(ht));
        assertEquals("0 \u2013 0", WidgetBoard.score(ht));
        WatchMatch scheduled = match("m2", "A", "B", NOW + HOUR, "scheduled");
        assertEquals("", WidgetBoard.score(scheduled));
        assertEquals("", WidgetBoard.minute(scheduled));
    }

    @Test
    public void rowsGrowWithHeight() {
        assertEquals(1, WidgetBoard.rowsFor(80));
        assertEquals(2, WidgetBoard.rowsFor(130));
        assertEquals(3, WidgetBoard.rowsFor(180));
        assertEquals(8, WidgetBoard.rowsFor(900));
    }
}

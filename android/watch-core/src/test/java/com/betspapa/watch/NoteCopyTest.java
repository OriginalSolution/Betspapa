package com.betspapa.watch;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

import java.util.Collections;
import java.util.List;
import org.junit.Test;

public class NoteCopyTest {
    private static final long KICK = 1_800_000_000_000L;

    private static WatchMatch match() {
        WatchMatch match = new WatchMatch();
        match.id = "sr:match:7";
        // The app stages the short name in `home` and the full name in `homeFull`.
        match.home = "Hearts";
        match.away = "Kotoko";
        match.homeFull = "Hearts of Oak";
        match.awayFull = "Asante Kotoko";
        match.homeAbbr = "HOO";
        match.awayAbbr = "AK";
        match.homeId = "hearts";
        match.awayId = "kotoko";
        match.kickoffMs = KICK;
        match.competition = "Ghana Premier League";
        match.status = "scheduled";
        return match;
    }

    private static WatchState followed() {
        WatchState state = new WatchState();
        state.browser = true;
        state.teamIds.add("hearts");
        return state;
    }

    private static WatchNote find(List<WatchNote> notes, String kind) {
        for (WatchNote note : notes) if (kind.equals(note.kind)) return note;
        return null;
    }

    @Test
    public void watcherAlertsUseFullClubNames() {
        WatchState state = followed();
        WatchMatch live = match();
        live.status = "live";
        live.minute = 30;
        live.homeScore = 1;
        live.awayScore = 0;
        live.addMarker("red", 28, "AK", "away", "Mohammed Alhassan");
        List<WatchNote> notes = AlertPlanner.notices(Collections.singletonList(live), state, KICK + 31 * 60_000L);
        WatchNote kickoff = find(notes, "kickoff");
        WatchNote goal = find(notes, "goal");
        WatchNote red = find(notes, "red");
        assertEquals("Kick-off: Hearts of Oak vs Asante Kotoko", kickoff.title);
        assertEquals("Ghana Premier League · underway", kickoff.body);
        assertEquals("GOAL! Hearts of Oak 1-0 Asante Kotoko", goal.title);
        assertEquals("30′ · Hearts of Oak score", goal.body);
        assertEquals("RED CARD! Hearts of Oak 1-0 Asante Kotoko", red.title);
        assertEquals("Mohammed Alhassan 28′ · Asante Kotoko", red.body);
        for (WatchNote note : notes) {
            String text = note.title + " " + note.body;
            assertFalse(text, text.matches(".*\\b(HOO|AK)\\b.*"));
            assertFalse(text, text.contains("Hearts vs") || text.contains("Hearts 1"));
        }
    }

    @Test
    public void halfAndFullTimeNameBothClubs() {
        WatchMatch match = match();
        match.homeScore = 2;
        match.awayScore = 1;
        assertEquals("Half-time: Hearts of Oak 1-0 Asante Kotoko", NoteCopy.halfTime(match, 1, 0).title);
        assertEquals("Full-time: Hearts of Oak 2-1 Asante Kotoko", NoteCopy.fullTime(match).title);
        assertEquals("GOAL! Hearts of Oak 2-1 Asante Kotoko", NoteCopy.goal(match, "home", "Afriyie Barnieh", 54).title);
        assertEquals("Afriyie Barnieh 54′ · Hearts of Oak", NoteCopy.goal(match, "home", "Afriyie Barnieh", 54).body);
        assertEquals("54′ · VAR rules out the Asante Kotoko goal", NoteCopy.disallowed(match, "away", 54).body);
    }

    @Test
    public void missingNamesFallBackGracefully() {
        WatchMatch bare = new WatchMatch();
        bare.homeScore = 1;
        assertEquals("GOAL! Home team 1-0 Away team", NoteCopy.goal(bare, "home", "", null).title);
        assertEquals("Home team score", NoteCopy.goal(bare, "home", "", null).body);
        assertEquals("Kick-off: Home team vs Away team", NoteCopy.kickoff(null).title);
        assertEquals("Goal under review", NoteCopy.varReview(bare, "", "", null).body);
    }
}

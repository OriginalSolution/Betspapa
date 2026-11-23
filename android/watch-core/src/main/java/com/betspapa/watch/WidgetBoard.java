package com.betspapa.watch;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * What the home-screen widget lists: the user's followed matches, live ones first,
 * then the next kick-offs. Pure Java so the order is unit-tested without Android.
 */
public final class WidgetBoard {
    /** Next kick-offs this far ahead. */
    public static final long HORIZON_MS = 7L * 24L * 60L * 60L * 1000L;
    /** A match that should have started but the live feed has not picked up yet. */
    public static final long LATE_START_MS = 20L * 60L * 1000L;
    public static final int MAX_ROWS = 12;

    private WidgetBoard() {}

    public static boolean live(WatchMatch match) {
        return match != null && ("live".equals(match.status) || "halftime".equals(match.status));
    }

    /** finished > live > scheduled, then the later minute. */
    static int progress(WatchMatch match) {
        if ("finished".equals(match.status)) return 3000;
        if (live(match)) return 1000 + (match.minute == null ? 0 : match.minute) + ("halftime".equals(match.status) ? 45 : 0);
        return 0;
    }

    /**
     * Merges every source by match id. A later source wins a tie, and a more advanced
     * record (a live or finished one) always beats a stale scheduled copy.
     */
    @SafeVarargs
    public static List<WatchMatch> merge(List<WatchMatch>... sources) {
        Map<String, WatchMatch> byId = new LinkedHashMap<String, WatchMatch>();
        for (List<WatchMatch> source : sources) {
            if (source == null) continue;
            for (WatchMatch match : source) {
                if (match == null || match.id == null || match.id.isEmpty()) continue;
                WatchMatch prior = byId.get(match.id);
                if (prior == null || progress(match) >= progress(prior)) {
                    if (prior != null) fill(match, prior);
                    byId.put(match.id, match);
                } else {
                    fill(prior, match);
                }
            }
        }
        return new ArrayList<WatchMatch>(byId.values());
    }

    /** A live row from the feed may lack the crest or full name the fixture carried. */
    private static void fill(WatchMatch into, WatchMatch from) {
        if (empty(into.homeCrest)) into.homeCrest = from.homeCrest;
        if (empty(into.awayCrest)) into.awayCrest = from.awayCrest;
        if (empty(into.homeFull)) into.homeFull = from.homeFull;
        if (empty(into.awayFull)) into.awayFull = from.awayFull;
        if (empty(into.homeId)) into.homeId = from.homeId;
        if (empty(into.awayId)) into.awayId = from.awayId;
        if (empty(into.competition)) into.competition = from.competition;
        if (into.kickoffMs <= 0) into.kickoffMs = from.kickoffMs;
    }

    private static boolean empty(String value) {
        return value == null || value.isEmpty();
    }

    /** Followed matches only: live first by kick-off, then upcoming by kick-off. */
    public static List<WatchMatch> rows(List<WatchMatch> merged, WatchState follows, long now) {
        List<WatchMatch> live = new ArrayList<WatchMatch>();
        List<WatchMatch> next = new ArrayList<WatchMatch>();
        if (merged == null || follows == null) return live;
        for (WatchMatch match : merged) {
            if (!follows.follows(match)) continue;
            if (live(match)) {
                live.add(match);
                continue;
            }
            if ("finished".equals(match.status) || "cancelled".equals(match.status) || "postponed".equals(match.status)) continue;
            if (match.kickoffMs <= 0) continue;
            if (match.kickoffMs < now - LATE_START_MS || match.kickoffMs > now + HORIZON_MS) continue;
            next.add(match);
        }
        Comparator<WatchMatch> byKickoff = new Comparator<WatchMatch>() {
            @Override
            public int compare(WatchMatch a, WatchMatch b) {
                int order = Long.compare(a.kickoffMs, b.kickoffMs);
                return order != 0 ? order : a.id.compareTo(b.id);
            }
        };
        Collections.sort(live, byKickoff);
        Collections.sort(next, byKickoff);
        List<WatchMatch> out = new ArrayList<WatchMatch>(live);
        out.addAll(next);
        return out.size() > MAX_ROWS ? new ArrayList<WatchMatch>(out.subList(0, MAX_ROWS)) : out;
    }

    public static boolean anyLive(List<WatchMatch> rows) {
        if (rows == null) return false;
        for (WatchMatch match : rows) if (live(match)) return true;
        return false;
    }

    /** "2 – 1" while live; empty before kick-off. */
    public static String score(WatchMatch match) {
        if (match == null || !live(match)) return "";
        int home = match.homeScore == null ? 0 : match.homeScore;
        int away = match.awayScore == null ? 0 : match.awayScore;
        return home + " \u2013 " + away;
    }

    /** "54′", "HT", or "LIVE" when the feed has no clock. */
    public static String minute(WatchMatch match) {
        if (match == null) return "";
        if ("halftime".equals(match.status)) return "HT";
        if (!live(match)) return "";
        return match.minute == null || match.minute <= 0 ? "LIVE" : match.minute + "\u2032";
    }

    /** Rows that fit a widget this many dp tall: 36dp header, 44dp per match. */
    public static int rowsFor(float heightDp) {
        int rows = (int) Math.floor((heightDp - 36f) / 44f);
        return Math.max(1, Math.min(8, rows));
    }
}

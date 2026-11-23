package com.betspapa.watch;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Same alert ids the in-app board uses, so a later open does not raise them again.
 * A VAR alert is created only when the match actually has a review.
 */
public final class AlertPlanner {
    public static final long LEAD_MS = 15L * 60L * 1000L;
    public static final long TAIL_MS = 130L * 60L * 1000L;
    public static final long FIXTURE_REFRESH_MS = 15L * 60L * 1000L;
    public static final long POLL_MS = 30_000L;
    public static final int WATCH_NOTIFICATION_ID = 2_000_000_001;

    private static final Map<String, String> LABELS = labels();

    private AlertPlanner() {}

    public static int notificationId(String value) {
        long hash = 0;
        for (int i = 0; i < value.length(); i++) {
            hash = (hash * 31 + value.charAt(i)) & 0xffffffffL;
        }
        return (int) ((hash % 2_000_000_000L) + 1L);
    }

    public static String slug(String value) {
        String text = value == null ? "" : value.toLowerCase(Locale.US).replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "");
        return text.isEmpty() ? "team" : text;
    }

    public static boolean shouldWatch(List<WatchMatch> matches, WatchState state, long now) {
        for (WatchMatch match : matches) {
            if (inWindow(match, state, now)) return true;
        }
        return false;
    }

    /** Followed matches that are actually in play, including half-time. */
    public static int liveCount(List<WatchMatch> matches, WatchState state) {
        int count = 0;
        for (WatchMatch match : matches) {
            if (!state.relevant(match)) continue;
            if ("live".equals(match.status) || "halftime".equals(match.status)) count++;
        }
        return count;
    }

    /**
     * When a kickoff is already known, wake at the start of its watch window.
     * Otherwise check the fixture list on the slow refresh, not every few seconds.
     */
    public static long nextWake(List<WatchMatch> matches, WatchState state, long now) {
        long soonest = Long.MAX_VALUE;
        for (WatchMatch match : matches) {
            if (!state.relevant(match) || "postponed".equals(match.status) || "finished".equals(match.status)) continue;
            if (match.kickoffMs <= 0) continue;
            long start = match.kickoffMs - LEAD_MS;
            if (start > now && start < soonest) soonest = start;
        }
        if (soonest != Long.MAX_VALUE) return soonest;
        return now + FIXTURE_REFRESH_MS;
    }

    public static List<WatchNote> notices(List<WatchMatch> matches, WatchState state, long now) {
        List<WatchNote> notes = new ArrayList<WatchNote>();
        for (WatchMatch match : matches) {
            if (!inWindow(match, state, now) && !justFinished(match, state, now)) continue;
            if (!state.follows(match)) continue;
            for (WatchNote note : signals(viewOf(match, now), state)) {
                if (state.seen(note.id) || !state.allows(note.kind)) continue;
                notes.add(note);
            }
        }
        for (String trend : state.trends) {
            String[] parts = splitTrend(trend);
            if (parts == null || !LABELS.containsKey(parts[1])) continue;
            WatchMatch match = find(matches, parts[0]);
            if (match == null || (!inWindow(match, state, now) && !justFinished(match, state, now))) continue;
            if (!"won".equals(settle(parts[1], viewOf(match, now)))) continue;
            String id = "trend:" + trend + ":hit";
            if (state.seen(id)) continue;
            org.json.JSONObject priced = state.bookingFor(trend);
            if (priced != null && belowFloor(priced.optString("odds", ""))) continue;
            String label = LABELS.get(parts[1]);
            NoteCopy.Copy copy = NoteCopy.trend(match, label);
            WatchNote note = new WatchNote(id, match.id, "win", copy.title, copy.body);
            note.marketLabel = label;
            note.fixture = NoteCopy.fixture(match);
            org.json.JSONObject booking = state.bookingFor(trend);
            if (booking != null) {
                String bookedLabel = booking.optString("marketLabel", "");
                if (!bookedLabel.isEmpty()) note.marketLabel = bookedLabel;
                String fixture = booking.optString("fixture", "");
                if (!fixture.isEmpty()) note.fixture = fixture;
                note.oddsText = booking.optString("odds", "");
                String code = booking.optString("code", "");
                if (!code.isEmpty()) {
                    note.bookId = booking.optString("bookId", "");
                    note.bookCode = code;
                }
            }
            notes.add(note);
        }
        return notes;
    }

    public static String settle(String market, WatchMatch match) {
        boolean homeSide = teamIsHome(market);
        boolean firstHalf = market.startsWith("fh-");
        if (firstHalf) {
            if (!halfReady(match) || match.htHome == null || match.htAway == null) return "open";
            int home = match.htHome;
            int away = match.htAway;
            int total = home + away;
            if ("fh-over05".equals(market)) return total >= 1 ? "won" : "bust";
            if ("fh-over15".equals(market)) return total >= 2 ? "won" : "bust";
            if ("fh-home".equals(market)) return home > away ? "won" : "bust";
            if ("fh-away".equals(market)) return away > home ? "won" : "bust";
            return home == away ? "won" : "bust";
        }
        if ("scheduled".equals(match.status) || "postponed".equals(match.status) || match.homeScore == null || match.awayScore == null) {
            return "open";
        }
        int home = match.homeScore;
        int away = match.awayScore;
        int total = home + away;
        boolean finished = "finished".equals(match.status);
        int conceded = homeSide ? away : home;
        int scored = homeSide ? home : away;
        if ("over05".equals(market)) return total >= 1 ? "won" : finished ? "bust" : "open";
        if ("over15".equals(market)) return total >= 2 ? "won" : finished ? "bust" : "open";
        if ("over25".equals(market)) return total >= 3 ? "won" : finished ? "bust" : "open";
        if ("over35".equals(market)) return total >= 4 ? "won" : finished ? "bust" : "open";
        if ("under15".equals(market)) return total >= 2 ? "bust" : finished ? "won" : "open";
        if ("under25".equals(market)) return total >= 3 ? "bust" : finished ? "won" : "open";
        if ("under35".equals(market)) return total >= 4 ? "bust" : finished ? "won" : "open";
        if ("btts".equals(market)) return home > 0 && away > 0 ? "won" : finished ? "bust" : "open";
        if ("btts-no".equals(market)) return home > 0 && away > 0 ? "bust" : finished ? "won" : "open";
        if ("home-score".equals(market)) return home > 0 ? "won" : finished ? "bust" : "open";
        if ("away-score".equals(market)) return away > 0 ? "won" : finished ? "bust" : "open";
        if ("clean".equals(market)) return conceded > 0 ? "bust" : finished ? "won" : "open";
        if ("home".equals(market)) return finished ? (home > away ? "won" : "bust") : "open";
        if ("away".equals(market)) return finished ? (away > home ? "won" : "bust") : "open";
        if ("draw".equals(market)) return finished ? (home == away ? "won" : "bust") : "open";
        if ("dc-1x".equals(market)) return finished ? (home >= away ? "won" : "bust") : "open";
        if ("dc-12".equals(market)) return finished ? (home != away ? "won" : "bust") : "open";
        if ("dc-x2".equals(market)) return finished ? (away >= home ? "won" : "bust") : "open";
        if ("dnb-home".equals(market)) {
            if (!finished) return "open";
            if (home > away) return "won";
            if (away > home) return "bust";
            return "open";
        }
        if ("dnb-away".equals(market)) {
            if (!finished) return "open";
            if (away > home) return "won";
            if (home > away) return "bust";
            return "open";
        }
        return scored > 0 && finished ? "won" : "open";
    }

    private static boolean inWindow(WatchMatch match, WatchState state, long now) {
        if (!state.relevant(match) || "postponed".equals(match.status) || "finished".equals(match.status)) return false;
        if ("live".equals(match.status) || "halftime".equals(match.status)) return true;
        if (match.kickoffMs <= 0) return false;
        return now >= match.kickoffMs - LEAD_MS && now <= match.kickoffMs + TAIL_MS;
    }

    private static boolean justFinished(WatchMatch match, WatchState state, long now) {
        if (!state.relevant(match) || !"finished".equals(match.status) || match.kickoffMs <= 0) return false;
        long age = now - match.kickoffMs;
        return age >= 0 && age <= TAIL_MS;
    }

    private static WatchMatch viewOf(WatchMatch match, long now) {
        if (!"scheduled".equals(match.status) || match.kickoffMs <= 0) return match;
        if (now < match.kickoffMs || now - match.kickoffMs > TAIL_MS) return match;
        WatchMatch view = match.copy();
        view.status = "live";
        return view;
    }

    static List<WatchNote> signals(WatchMatch match, WatchState state) {
        List<WatchNote> out = new ArrayList<WatchNote>();
        if ("scheduled".equals(match.status) || "postponed".equals(match.status)) return out;
        NoteCopy.Copy kickoff = NoteCopy.kickoff(match);
        out.add(new WatchNote(match.id + ":kickoff", match.id, "kickoff", kickoff.title, kickoff.body));
        boolean holdHome = false;
        boolean holdAway = false;
        if (match.varReview != null) {
            holdHome = match.homeId != null && match.homeId.equals(match.varReview.teamId);
            holdAway = match.awayId != null && match.awayId.equals(match.varReview.teamId);
            String side = holdHome ? "home" : holdAway ? "away" : "";
            String named = match.varReview.player == null ? "" : match.varReview.player.trim();
            String player = named.isEmpty() ? "Goal" : named;
            NoteCopy.Copy copy = NoteCopy.varReview(match, side, named, match.varReview.minute);
            WatchNote review = new WatchNote(
                match.id + ":var:" + match.varReview.minute + ":" + player,
                match.id,
                "var",
                copy.title,
                copy.body
            );
            review.minute = match.varReview.minute;
            review.player = player;
            review.varCheck = true;
            out.add(review);
        }
        // Scores are diffed against the last confirmed tally. A goal on the side
        // currently under VAR stays uncounted until that review leaves the feed.
        int homeFloor = match.seenHome == null ? 0 : match.seenHome;
        int awayFloor = match.seenAway == null ? 0 : match.seenAway;
        boolean inPlay = "live".equals(match.status) || "halftime".equals(match.status) || "finished".equals(match.status);
        if (!holdHome) sideNotes(out, match, state, true, homeFloor, inPlay);
        if (!holdAway) sideNotes(out, match, state, false, awayFloor, inPlay);
        // Only the break itself. "Half-time" at full time, or at 45' while stoppage time is still
        // being played, was a stale card.
        if ("halftime".equals(match.status)) {
            boolean known = match.htHome != null && match.htAway != null;
            NoteCopy.Copy copy = NoteCopy.halfTime(match, known ? match.htHome : match.homeScore, known ? match.htAway : match.awayScore);
            out.add(new WatchNote(match.id + ":ht", match.id, "ht", copy.title, copy.body));
        }
        if ("finished".equals(match.status)) {
            NoteCopy.Copy copy = NoteCopy.fullTime(match);
            out.add(new WatchNote(match.id + ":ft", match.id, "ft", copy.title, copy.body));
        }
        boolean sawVar = match.varReview != null;
        for (WatchMatch.Marker marker : match.markers) {
            if ("red".equals(marker.type)) out.add(cardNote(match, marker, "red", "Red card"));
            if ("penalty".equals(marker.type)) out.add(cardNote(match, marker, "penalty", "Penalty"));
            if ("var".equals(marker.type) && !sawVar) out.add(cardNote(match, marker, "var", "VAR"));
        }
        return out;
    }

    /**
     * Goals above the confirmed tally alert. A tally that went down is VAR (or the
     * feed) taking goals back: each gets a silent Disallowed card that replaces the
     * goal card, and the next goal at that count gets a new revision id so it still
     * alerts. The server builds the same ids, so FCM and this watcher never double up.
     */
    private static void sideNotes(List<WatchNote> out, WatchMatch match, WatchState state, boolean home, int floor, boolean inPlay) {
        int now = count(home ? match.homeScore : match.awayScore);
        String side = home ? "home" : "away";
        if (now < floor) {
            if (!inPlay) return;
            NoteCopy.Copy copy = NoteCopy.disallowed(match, side, match.minute);
            for (int index = floor; index > now; index--) {
                String goalId = goalId(match.id, side, index, revision(state, match.id, side, index));
                WatchNote note = new WatchNote(
                    goalId + ":cancelled",
                    match.id,
                    "var",
                    copy.title,
                    copy.body
                );
                note.disallowed = true;
                note.varCheck = true;
                note.replaces = goalId;
                note.minute = match.minute;
                out.add(note);
            }
            return;
        }
        for (int index = floor + 1; index <= now; index++) out.add(goal(match, home, index, revision(state, match.id, side, index)));
    }

    public static String goalId(String matchId, String side, int index, int rev) {
        String base = matchId + ":goal:" + side + ":" + index;
        return rev > 0 ? base + ":r" + rev : base;
    }

    /** How many times goal `index` on this side was taken back, read from the cards already raised. */
    static int revision(WatchState state, String matchId, String side, int index) {
        if (state == null) return 0;
        int rev = 0;
        while (rev < 20 && state.seen(goalId(matchId, side, index, rev) + ":cancelled")) rev++;
        return rev;
    }

    private static WatchNote cardNote(WatchMatch match, WatchMatch.Marker marker, String kind, String title) {
        String named = marker.player == null ? "" : marker.player.trim();
        String player = named.isEmpty() ? title : named;
        String side = "away".equals(marker.side) ? "away" : "home".equals(marker.side) ? "home" : sideOfAbbr(match, marker.abbr);
        NoteCopy.Copy copy = NoteCopy.incident(match, kind, side, named, marker.minute);
        WatchNote note = new WatchNote(
            match.id + ":" + kind + ":" + marker.side + ":" + marker.minute + ":" + player,
            match.id,
            kind,
            copy.title,
            copy.body
        );
        note.minute = marker.minute;
        note.player = player;
        note.varCheck = "var".equals(kind);
        return note;
    }

    private static int count(Integer score) {
        return score == null ? 0 : score;
    }

    private static WatchNote goal(WatchMatch match, boolean home, int index, int rev) {
        String side = home ? "home" : "away";
        NoteCopy.Copy copy = NoteCopy.goal(match, side, "", match.minute);
        WatchNote note = new WatchNote(goalId(match.id, side, index, rev), match.id, "goal", copy.title, copy.body);
        note.minute = match.minute;
        return note;
    }

    /** Older markers only carry the team abbreviation; map it back to a side. */
    private static String sideOfAbbr(WatchMatch match, String abbr) {
        if (abbr == null || abbr.isEmpty()) return "";
        if (abbr.equals(match.abbrHome()) && !abbr.equals(match.abbrAway())) return "home";
        if (abbr.equals(match.abbrAway()) && !abbr.equals(match.abbrHome())) return "away";
        return "";
    }

    private static boolean halfReady(WatchMatch match) {
        if (match.htHome == null || match.htAway == null) return false;
        if ("halftime".equals(match.status) || "finished".equals(match.status)) return true;
        return "live".equals(match.status) && match.minute != null && match.minute >= 45;
    }

    static boolean belowFloor(String oddsText) {
        if (oddsText == null) return false;
        String clean = oddsText.trim();
        if (clean.isEmpty()) return false;
        try {
            return Double.parseDouble(clean) < 1.2d;
        } catch (NumberFormatException error) {
            return false;
        }
    }

    private static boolean teamIsHome(String market) {
        return !("away".equals(market) || "away-score".equals(market) || "dnb-away".equals(market) || "fh-away".equals(market));
    }

    private static String[] splitTrend(String trendId) {
        if (trendId == null) return null;
        int cut = trendId.lastIndexOf(':');
        if (cut <= 0 || cut >= trendId.length() - 1) return null;
        return new String[] {trendId.substring(0, cut), trendId.substring(cut + 1)};
    }

    private static WatchMatch find(List<WatchMatch> matches, String id) {
        for (WatchMatch match : matches) {
            if (id.equals(match.id)) return match;
        }
        return null;
    }

    private static Map<String, String> labels() {
        Map<String, String> labels = new HashMap<String, String>();
        labels.put("home", "Full-time home win");
        labels.put("draw", "Full-time draw");
        labels.put("away", "Full-time away win");
        labels.put("dc-1x", "Double chance 1X");
        labels.put("dc-12", "Double chance 12");
        labels.put("dc-x2", "Double chance X2");
        labels.put("dnb-home", "Draw no bet · home");
        labels.put("dnb-away", "Draw no bet · away");
        labels.put("over05", "Over 0.5 goals");
        labels.put("over15", "Over 1.5 goals");
        labels.put("over25", "Over 2.5 goals");
        labels.put("over35", "Over 3.5 goals");
        labels.put("under15", "Under 1.5 goals");
        labels.put("under25", "Under 2.5 goals");
        labels.put("under35", "Under 3.5 goals");
        labels.put("btts", "Both teams to score");
        labels.put("btts-no", "Both teams not to score");
        labels.put("home-score", "Home team to score");
        labels.put("away-score", "Away team to score");
        labels.put("clean", "Clean sheet");
        labels.put("fh-home", "First-half home win");
        labels.put("fh-draw", "First-half draw");
        labels.put("fh-away", "First-half away win");
        labels.put("fh-over05", "First-half over 0.5");
        labels.put("fh-over15", "First-half over 1.5");
        return labels;
    }
}

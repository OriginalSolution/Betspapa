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

    private static final String DASH = "\u2013";
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
            for (WatchNote note : signals(viewOf(match, now))) {
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
            String label = LABELS.get(parts[1]);
            WatchNote note = new WatchNote(id, match.id, "win", "Trend hit · " + label, match.home + " vs " + match.away + " · " + label);
            note.marketLabel = label;
            note.fixture = match.abbrHome() + " vs " + match.abbrAway();
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

    private static List<WatchNote> signals(WatchMatch match) {
        List<WatchNote> out = new ArrayList<WatchNote>();
        if ("scheduled".equals(match.status) || "postponed".equals(match.status)) return out;
        String versus = match.home + " vs " + match.away;
        String current = scoreText(match.homeScore, match.awayScore);
        out.add(new WatchNote(match.id + ":kickoff", match.id, "kickoff", "Kick-off", versus + " is underway"));
        boolean holdHome = false;
        boolean holdAway = false;
        if (match.varReview != null) {
            holdHome = match.homeId != null && match.homeId.equals(match.varReview.teamId);
            holdAway = match.awayId != null && match.awayId.equals(match.varReview.teamId);
            String team = holdHome ? match.home : match.away;
            String player = match.varReview.player == null || match.varReview.player.isEmpty() ? "Goal" : match.varReview.player;
            WatchNote review = new WatchNote(
                match.id + ":var:" + match.varReview.minute + ":" + player,
                match.id,
                "var",
                "VAR",
                player + " " + match.varReview.minute + "′ · " + team + " goal under review"
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
        if (!holdHome) {
            for (int index = homeFloor + 1; index <= count(match.homeScore); index++) out.add(goal(match, true, index));
        }
        if (!holdAway) {
            for (int index = awayFloor + 1; index <= count(match.awayScore); index++) out.add(goal(match, false, index));
        }
        boolean pastHalf = "halftime".equals(match.status)
            || "finished".equals(match.status)
            || ("live".equals(match.status) && match.minute != null && match.minute >= 45);
        if (pastHalf) {
            String ht = match.htHome != null && match.htAway != null ? scoreText(match.htHome, match.htAway) : current;
            out.add(new WatchNote(match.id + ":ht", match.id, "ht", "Half-time", match.home + " " + ht + " " + match.away));
        }
        if ("finished".equals(match.status)) {
            out.add(new WatchNote(match.id + ":ft", match.id, "ft", "Full-time", match.home + " " + current + " " + match.away));
        }
        return out;
    }

    private static int count(Integer score) {
        return score == null ? 0 : score;
    }

    private static WatchNote goal(WatchMatch match, boolean home, int index) {
        String team = home ? match.home : match.away;
        String side = home ? "home" : "away";
        WatchNote note = new WatchNote(
            match.id + ":goal:" + side + ":" + index,
            match.id,
            "goal",
            "Goal · " + team,
            team + " score · " + match.home + " " + scoreText(match.homeScore, match.awayScore) + " " + match.away
        );
        note.minute = match.minute;
        note.player = team;
        return note;
    }

    private static String scoreText(Integer home, Integer away) {
        int left = home == null ? 0 : home;
        int right = away == null ? 0 : away;
        return left + DASH + right;
    }

    private static boolean halfReady(WatchMatch match) {
        if (match.htHome == null || match.htAway == null) return false;
        if ("halftime".equals(match.status) || "finished".equals(match.status)) return true;
        return "live".equals(match.status) && match.minute != null && match.minute >= 45;
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

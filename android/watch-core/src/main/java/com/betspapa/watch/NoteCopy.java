package com.betspapa.watch;

/**
 * Alert wording for the phone's own watcher. Every match alert names both clubs in full
 * ("GOAL! Arsenal 1-0 Chelsea"), with the scorer and minute when known. The server
 * (src/lib/noteCopy.mjs) builds the same strings for FCM, so a card reads the same
 * whichever path raised it.
 */
public final class NoteCopy {
    public static final String HOME = "Home team";
    public static final String AWAY = "Away team";

    private NoteCopy() {}

    public static final class Copy {
        public final String title;
        public final String body;

        Copy(String title, String body) {
            this.title = title;
            this.body = body;
        }
    }

    public static String clean(String value) {
        return value == null ? "" : value.replaceAll("\\s+", " ").trim();
    }

    public static String home(WatchMatch match) {
        String name = match == null ? "" : clean(match.fullHome());
        return name.isEmpty() ? HOME : name;
    }

    public static String away(WatchMatch match) {
        String name = match == null ? "" : clean(match.fullAway());
        return name.isEmpty() ? AWAY : name;
    }

    /** The club for "home" or "away"; "" when the side is not known. */
    public static String team(WatchMatch match, String side) {
        if ("home".equals(side)) return home(match);
        if ("away".equals(side)) return away(match);
        return "";
    }

    public static String minute(Integer minute) {
        return minute == null || minute < 0 ? "" : minute + "\u2032";
    }

    /** "Arsenal 1-0 Chelsea". */
    public static String scoreLine(WatchMatch match, Integer homeScore, Integer awayScore) {
        int left = homeScore == null ? 0 : homeScore;
        int right = awayScore == null ? 0 : awayScore;
        return home(match) + " " + left + "-" + right + " " + away(match);
    }

    public static String scoreLine(WatchMatch match) {
        return scoreLine(match, match == null ? null : match.homeScore, match == null ? null : match.awayScore);
    }

    /** "Arsenal vs Chelsea". */
    public static String fixture(WatchMatch match) {
        return home(match) + " vs " + away(match);
    }

    /** "Saka 54′ · Arsenal", "54′ · Arsenal" or "Arsenal". */
    static String who(String player, Integer minute, String team) {
        String name = clean(player);
        String mark = minute(minute);
        String lead = name.isEmpty() ? mark : mark.isEmpty() ? name : name + " " + mark;
        if (lead.isEmpty()) return team == null ? "" : team;
        return team == null || team.isEmpty() ? lead : lead + " \u00b7 " + team;
    }

    private static String competition(WatchMatch match) {
        return match == null ? "" : clean(match.competition);
    }

    public static Copy kickoff(WatchMatch match) {
        String league = competition(match);
        return new Copy("Kick-off: " + fixture(match), league.isEmpty() ? "Underway now" : league + " \u00b7 underway");
    }

    public static Copy goal(WatchMatch match, String side, String player, Integer minute) {
        String team = team(match, side);
        String name = clean(player);
        String body = !name.isEmpty() ? who(name, minute, team) : who("", minute, team.isEmpty() ? "Goal" : team + " score");
        return new Copy("GOAL! " + scoreLine(match), body);
    }

    public static Copy disallowed(WatchMatch match, String side, Integer minute) {
        String team = team(match, side);
        return new Copy("GOAL DISALLOWED! " + scoreLine(match), who("", minute, team.isEmpty() ? "VAR rules the goal out" : "VAR rules out the " + team + " goal"));
    }

    public static Copy varReview(WatchMatch match, String side, String player, Integer minute) {
        String team = team(match, side);
        return new Copy("VAR CHECK: " + scoreLine(match), who(player, minute, team.isEmpty() ? "Goal under review" : team + " goal under review"));
    }

    public static Copy incident(WatchMatch match, String type, String side, String player, Integer minute) {
        String head = "red".equals(type) ? "RED CARD!" : "penalty".equals(type) ? "PENALTY!" : "VAR CHECK:";
        return new Copy(head + " " + scoreLine(match), who(player, minute, team(match, side)));
    }

    public static Copy halfTime(WatchMatch match, Integer htHome, Integer htAway) {
        String league = competition(match);
        return new Copy("Half-time: " + scoreLine(match, htHome, htAway), league.isEmpty() ? "Half-time score" : league);
    }

    public static Copy fullTime(WatchMatch match) {
        String league = competition(match);
        return new Copy("Full-time: " + scoreLine(match), league.isEmpty() ? "Final score" : league);
    }

    public static Copy trend(WatchMatch match, String label) {
        return new Copy("Trend hit \u00b7 " + label, scoreLine(match) + " \u00b7 " + label);
    }

    /** Short pick name for a card: "Over 1.5", "Home win". */
    public static String pickName(String label) {
        String text = clean(label);
        String lower = text.toLowerCase();
        if ("full-time home win".equals(lower)) return "Home win";
        if ("full-time away win".equals(lower)) return "Away win";
        if ("full-time draw".equals(lower)) return "Draw";
        if ("both teams to score".equals(lower)) return "Both teams to score";
        if (lower.endsWith(" goals") && lower.length() > " goals".length()) return text.substring(0, text.length() - " goals".length());
        return text.isEmpty() ? "Pick" : text;
    }
}

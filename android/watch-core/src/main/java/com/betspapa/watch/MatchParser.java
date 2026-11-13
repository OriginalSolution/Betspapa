package com.betspapa.watch;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

public final class MatchParser {
    private static final Pattern SCORE = Pattern.compile("^(\\d+)\\s*[:\\-]\\s*(\\d+)$");
    private static final Pattern DUMMY = Pattern.compile("simulated|virtual|e-?soccer|esports|cyber", Pattern.CASE_INSENSITIVE);
    private static final Pattern SRL_WORD = Pattern.compile("\\bsrl\\b", Pattern.CASE_INSENSITIVE);

    private MatchParser() {}

    public static List<WatchMatch> parseUpcoming(String json) {
        List<WatchMatch> matches = new ArrayList<WatchMatch>();
        JSONArray events = new JSONObject(json == null ? "{}" : json).optJSONArray("events");
        if (events == null) return matches;
        for (int i = 0; i < events.length(); i++) {
            JSONObject event = events.optJSONObject(i);
            if (event == null) continue;
            String home = event.optString("home", "").trim();
            String away = event.optString("away", "").trim();
            String id = event.optString("eventId", "").trim();
            long kick = WatchClock.parseIso(event.optString("kickoff", ""));
            if (id.isEmpty() || home.isEmpty() || away.isEmpty() || kick <= 0) continue;
            if (simulatedFixture(event.optString("country", ""), event.optString("tournament", ""), home, away)) continue;
            matches.add(scheduled(id, home, away, kick));
        }
        return matches;
    }

    public static List<WatchMatch> parseLive(String json) {
        List<WatchMatch> matches = new ArrayList<WatchMatch>();
        JSONArray rows = new JSONObject(json == null ? "{}" : json).optJSONArray("data");
        if (rows == null) return matches;
        for (int i = 0; i < rows.length(); i++) {
            JSONObject tournament = rows.optJSONObject(i);
            if (tournament == null) continue;
            JSONArray events = tournament.optJSONArray("events");
            if (events == null) continue;
            for (int j = 0; j < events.length(); j++) {
                JSONObject event = events.optJSONObject(j);
                WatchMatch match = liveEvent(event, tournament);
                if (match != null) matches.add(match);
            }
        }
        return matches;
    }

    private static WatchMatch liveEvent(JSONObject event, JSONObject tournament) {
        if (event == null) return null;
        String home = event.optString("homeTeamName", "").trim();
        String away = event.optString("awayTeamName", "").trim();
        String id = event.optString("eventId", "").trim();
        if (id.isEmpty() || home.isEmpty() || away.isEmpty()) return null;
        String competition = "";
        String categoryName = tournament.optString("categoryName", "");
        JSONObject sport = event.optJSONObject("sport");
        if (sport != null) {
            JSONObject category = sport.optJSONObject("category");
            if (category != null) {
                if (categoryName.isEmpty()) categoryName = category.optString("name", "");
                JSONObject listed = category.optJSONObject("tournament");
                if (listed != null) competition = listed.optString("name", "");
            }
        }
        if (competition.isEmpty()) competition = tournament.optString("name", "");
        if (simulatedFixture(categoryName, competition, home, away)) return null;
        String status = liveStatus(event.optString("matchStatus", ""), event.has("status") && !event.isNull("status") ? event.optInt("status") : null);
        if ("scheduled".equals(status)) return null;
        long kick = event.optLong("estimateStartTime", 0L);
        if (kick > 0 && kick < 10_000_000_000L) kick *= 1000L;
        WatchMatch match = scheduled(id, home, away, kick);
        match.homeFull = home;
        match.awayFull = away;
        match.competition = competition == null ? "" : competition.trim();
        match.status = status;
        match.minute = liveMinute(event.optString("playedSeconds", ""), event.optString("matchStatus", ""));
        int[] score = pair(event.optString("setScore", ""));
        if (score != null) {
            match.homeScore = score[0];
            match.awayScore = score[1];
        }
        JSONArray gameScore = event.optJSONArray("gameScore");
        String period = event.optString("period", event.optString("matchStatus", "")).toUpperCase(Locale.US);
        boolean second = "2".equals(period) || "H2".equals(period) || "2H".equals(period) || "halftime".equals(status) || "finished".equals(status);
        if (second && gameScore != null && gameScore.length() > 0) {
            int[] half = pair(gameScore.optString(0, ""));
            if (half != null) {
                match.htHome = half[0];
                match.htAway = half[1];
            }
        }
        JSONObject review = event.optJSONObject("varReview");
        if (review != null && !review.optString("teamId", "").trim().isEmpty()) {
            WatchMatch.VarReview varReview = new WatchMatch.VarReview();
            varReview.teamId = review.optString("teamId", "").trim();
            varReview.player = review.optString("player", "Goal").trim();
            if (varReview.player.isEmpty()) varReview.player = "Goal";
            varReview.minute = review.optInt("minute", match.minute == null ? 0 : match.minute);
            match.varReview = varReview;
        }
        readMarks(match, event.optJSONArray("timeline"));
        if (!hasGoal(match)) readMarks(match, event.optJSONArray("incidents"));
        if (!hasGoal(match)) readMarks(match, event.optJSONArray("comments"));
        match.stampMissingGoals(match.minute == null ? -1 : match.minute);
        return match;
    }

    private static boolean hasGoal(WatchMatch match) {
        for (WatchMatch.Marker marker : match.markers) {
            if ("goal".equals(marker.type) && !marker.estimated) return true;
        }
        return false;
    }

    private static void readMarks(WatchMatch match, JSONArray rows) {
        if (rows == null) return;
        int home = 0;
        int away = 0;
        for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.optJSONObject(i);
            if (row == null) continue;
            java.util.List<String> kinds = incidentKinds(row.optString("type", row.optString("incidentType", "")));
            if (kinds.isEmpty()) continue;
            String side = row.optString("side", row.optString("team", row.optString("homeOrAway", ""))).toLowerCase(Locale.US);
            if (side.startsWith("away") || "2".equals(side)) side = "away";
            else if (side.startsWith("home") || "1".equals(side)) side = "home";
            else side = "";
            String abbr = row.optString("abbr", "");
            if (abbr.isEmpty()) abbr = "away".equals(side) ? match.abbrAway() : match.abbrHome();
            if (side.isEmpty()) side = abbr.equals(match.abbrAway()) ? "away" : "home";
            Integer at = incidentMinute(row);
            if (at == null) continue;
            String player = row.optString("player", row.optString("playerName", row.optString("scorer", ""))).trim();
            for (String type : kinds) {
                if ("goal".equals(type)) {
                    int index = "away".equals(side) ? ++away : ++home;
                    match.setGoal(side, index, at, abbr, player, true);
                } else {
                    match.addMarker(type, at, abbr, side, player);
                }
            }
        }
    }

    /**
     * The live list and the event detail payload do not include a timeline, incidents,
     * comments, VAR, red cards, or penalties (checked 2026-11-13). Rows are still read
     * when a feed starts sending them. A penalty goal is both a goal and a penalty.
     */
    static java.util.List<String> incidentKinds(String raw) {
        String type = raw == null ? "" : raw.toLowerCase(Locale.US).replace('_', ' ').replace('-', ' ');
        java.util.List<String> kinds = new java.util.ArrayList<String>();
        if (type.trim().isEmpty()) return kinds;
        boolean red = type.contains("red") || type.contains("second yellow") || type.contains("yellow red");
        boolean penalty = type.contains("penalty") || type.equals("pen");
        boolean goal = type.contains("goal") || type.contains("scored");
        boolean review = type.contains("var") || type.contains("video assistant");
        boolean yellow = type.contains("yellow") && !red;
        if (review) kinds.add("var");
        if (red) kinds.add("red");
        if (penalty) kinds.add("penalty");
        if (goal) kinds.add("goal");
        if (yellow) kinds.add("yellow");
        return kinds;
    }

    private static Integer incidentMinute(JSONObject row) {
        if (row.has("minute") && !row.isNull("minute")) return row.optInt("minute", 0);
        for (String key : new String[] {"time", "matchTime", "played"}) {
            if (!row.has(key) || row.isNull(key)) continue;
            String raw = row.optString(key, "").trim();
            if (raw.isEmpty()) continue;
            int cut = 0;
            while (cut < raw.length() && Character.isDigit(raw.charAt(cut))) cut++;
            if (cut == 0) continue;
            try {
                return Integer.parseInt(raw.substring(0, cut));
            } catch (NumberFormatException error) {
                return null;
            }
        }
        return null;
    }

    static String liveStatus(String matchStatus, Integer numeric) {
        String status = matchStatus == null ? "" : matchStatus.trim().toUpperCase(Locale.US);
        if (status.equals("HT") || status.equals("PAUSED") || status.equals("HALFTIME") || status.equals("HALF-TIME") || status.equals("HALF TIME")) {
            return "halftime";
        }
        if (status.equals("FT") || status.equals("ENDED") || status.equals("FINISHED") || status.equals("AET") || status.equals("AP") || status.equals("CLOSED") || status.equals("AWD") || status.equals("WO")) {
            return "finished";
        }
        if (status.equals("PST") || status.equals("POSTPONED") || status.equals("CANCELLED") || status.equals("CANCELED") || status.equals("ABD") || status.equals("ABANDONED")) {
            return "postponed";
        }
        if (status.equals("H1") || status.equals("1H") || status.equals("H2") || status.equals("2H") || status.equals("LIVE") || status.equals("OT") || status.equals("ET") || status.equals("PEN") || status.equals("INPLAY") || status.equals("IN PLAY")) {
            return "live";
        }
        if (numeric != null && (numeric == 3 || numeric == 4)) return "finished";
        if (numeric != null && (numeric == 1 || numeric == 2)) return "live";
        return "scheduled";
    }

    static Integer liveMinute(String played, String matchStatus) {
        String[] parts = String.valueOf(played == null ? "" : played).split(":");
        if (parts.length == 0 || parts[0].isEmpty()) return null;
        int minute;
        try {
            minute = Integer.parseInt(parts[0].trim());
        } catch (NumberFormatException error) {
            return null;
        }
        String half = matchStatus == null ? "" : matchStatus.trim().toUpperCase(Locale.US);
        if ((half.equals("H2") || half.equals("2H") || half.equals("HT")) && minute < 46) return minute + 45;
        return minute;
    }

    private static WatchMatch scheduled(String id, String home, String away, long kick) {
        WatchMatch match = new WatchMatch();
        match.id = id;
        match.home = home;
        match.away = away;
        match.homeId = AlertPlanner.slug(home);
        match.awayId = AlertPlanner.slug(away);
        match.kickoffMs = kick;
        match.status = "scheduled";
        return match;
    }

    private static int[] pair(String value) {
        Matcher matcher = SCORE.matcher(value == null ? "" : value.trim());
        if (!matcher.matches()) return null;
        return new int[] {Integer.parseInt(matcher.group(1)), Integer.parseInt(matcher.group(2))};
    }

    /** Simulated Reality and virtual fixtures stay off the board. A real club ending in the legal form SRL does not. */
    private static boolean simulatedFixture(String country, String tournament, String home, String away) {
        String place = (country == null ? "" : country) + " " + (tournament == null ? "" : tournament);
        String names = (home == null ? "" : home) + " " + (away == null ? "" : away);
        if (DUMMY.matcher(place + " " + names).find()) return true;
        if (SRL_WORD.matcher(place).find()) return true;
        return srlSide(home) && srlSide(away);
    }

    private static boolean srlSide(String name) {
        if (name == null) return false;
        String lower = name.toLowerCase(Locale.ROOT);
        if (lower.contains("societ") || lower.contains("sportiva") || lower.contains("s.r.l")) return false;
        return lower.endsWith(" srl");
    }
}

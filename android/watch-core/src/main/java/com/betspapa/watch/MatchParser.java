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
    private static final Pattern VIRTUAL = Pattern.compile("simulated|virtual|\\bsrl\\b", Pattern.CASE_INSENSITIVE);

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
            if (virtual(home + " " + away + " " + event.optString("tournament", ""))) continue;
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
        JSONObject sport = event.optJSONObject("sport");
        if (sport != null) {
            JSONObject category = sport.optJSONObject("category");
            if (category != null) {
                JSONObject listed = category.optJSONObject("tournament");
                if (listed != null) competition = listed.optString("name", "");
            }
        }
        if (competition.isEmpty()) competition = tournament.optString("name", "");
        if (virtual(home + " " + away + " " + competition)) return null;
        String status = liveStatus(event.optString("matchStatus", ""), event.has("status") && !event.isNull("status") ? event.optInt("status") : null);
        if ("scheduled".equals(status)) return null;
        long kick = event.optLong("estimateStartTime", 0L);
        if (kick > 0 && kick < 10_000_000_000L) kick *= 1000L;
        WatchMatch match = scheduled(id, home, away, kick);
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
        return match;
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

    private static boolean virtual(String text) {
        return VIRTUAL.matcher(text == null ? "" : text).find();
    }
}

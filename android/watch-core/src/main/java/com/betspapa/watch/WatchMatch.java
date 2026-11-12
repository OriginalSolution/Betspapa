package com.betspapa.watch;

import org.json.JSONObject;

/** A fixture the watcher can score. Names are the public labels from Betspapa fixtures. */
public final class WatchMatch {
    public String id = "";
    public String homeId = "";
    public String home = "";
    public String awayId = "";
    public String away = "";
    public long kickoffMs;
    public String status = "scheduled";
    public Integer minute;
    public Integer homeScore;
    public Integer awayScore;
    public Integer htHome;
    public Integer htAway;
    public VarReview varReview;
    /** Last confirmed score. Null means this match has not been diffed yet. */
    public Integer seenHome;
    public Integer seenAway;

    public static final class VarReview {
        public String teamId = "";
        public String player = "";
        public int minute;

        VarReview copy() {
            VarReview next = new VarReview();
            next.teamId = teamId;
            next.player = player;
            next.minute = minute;
            return next;
        }
    }

    WatchMatch copy() {
        WatchMatch next = new WatchMatch();
        next.id = id;
        next.homeId = homeId;
        next.home = home;
        next.awayId = awayId;
        next.away = away;
        next.kickoffMs = kickoffMs;
        next.status = status;
        next.minute = minute;
        next.homeScore = homeScore;
        next.awayScore = awayScore;
        next.htHome = htHome;
        next.htAway = htAway;
        next.varReview = varReview == null ? null : varReview.copy();
        next.seenHome = seenHome;
        next.seenAway = seenAway;
        return next;
    }

    JSONObject toJson() {
        JSONObject json = new JSONObject();
        json.put("id", id);
        json.put("homeId", homeId);
        json.put("home", home);
        json.put("awayId", awayId);
        json.put("away", away);
        json.put("kickoffMs", kickoffMs);
        json.put("status", status);
        json.put("minute", minute);
        json.put("homeScore", homeScore);
        json.put("awayScore", awayScore);
        json.put("htHome", htHome);
        json.put("htAway", htAway);
        json.put("seenHome", seenHome);
        json.put("seenAway", seenAway);
        if (varReview != null) {
            JSONObject review = new JSONObject();
            review.put("teamId", varReview.teamId);
            review.put("player", varReview.player);
            review.put("minute", varReview.minute);
            json.put("varReview", review);
        } else {
            json.put("varReview", JSONObject.NULL);
        }
        return json;
    }

    static WatchMatch fromJson(JSONObject json) {
        WatchMatch match = new WatchMatch();
        if (json == null) return match;
        match.id = json.optString("id", "");
        match.homeId = json.optString("homeId", "");
        match.home = json.optString("home", "");
        match.awayId = json.optString("awayId", "");
        match.away = json.optString("away", "");
        match.kickoffMs = json.optLong("kickoffMs", 0L);
        if (match.kickoffMs == 0L && json.has("kickoff")) match.kickoffMs = WatchClock.parseIso(json.optString("kickoff", ""));
        match.status = json.optString("status", "scheduled");
        if (match.status.isEmpty()) match.status = "scheduled";
        match.minute = integerOrNull(json, "minute");
        match.homeScore = integerOrNull(json, "homeScore");
        match.awayScore = integerOrNull(json, "awayScore");
        match.htHome = integerOrNull(json, "htHome");
        match.htAway = integerOrNull(json, "htAway");
        match.seenHome = integerOrNull(json, "seenHome");
        match.seenAway = integerOrNull(json, "seenAway");
        JSONObject review = json.optJSONObject("varReview");
        if (review != null && !review.optString("teamId", "").isEmpty()) {
            VarReview varReview = new VarReview();
            varReview.teamId = review.optString("teamId", "");
            varReview.player = review.optString("player", "Goal");
            varReview.minute = review.optInt("minute", 0);
            match.varReview = varReview;
        }
        return match;
    }

    private static Integer integerOrNull(JSONObject json, String key) {
        if (!json.has(key) || json.isNull(key)) return null;
        return json.optInt(key);
    }
}

package com.betspapa.watch;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/** A fixture the watcher can score. Names are the public labels from Betspapa fixtures. */
public final class WatchMatch {
    public String id = "";
    public String homeId = "";
    public String home = "";
    public String awayId = "";
    public String away = "";
    public String homeFull = "";
    public String awayFull = "";
    public String homeAbbr = "";
    public String awayAbbr = "";
    public String homeColor = "";
    public String awayColor = "";
    public String homeCrest = "";
    public String awayCrest = "";
    public String competition = "";
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
    public final List<Marker> markers = new ArrayList<Marker>();

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

    /** A goal, card, or VAR mark on the 0′–90′ pitch line. */
    public static final class Marker {
        public String type = "";
        public int minute;
        public String abbr = "";
        /** home or away. Empty on older rows that only stored the abbreviation. */
        public String side = "";
        /** 1-based goal count for that side. 0 for cards and VAR. */
        public int index;
        public String player = "";
        /** True when the minute is the match minute at which the score change was first seen. */
        public boolean estimated;

        Marker copy() {
            Marker next = new Marker();
            next.type = type;
            next.minute = minute;
            next.abbr = abbr;
            next.side = side;
            next.index = index;
            next.player = player;
            next.estimated = estimated;
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
        next.homeFull = homeFull;
        next.awayFull = awayFull;
        next.homeAbbr = homeAbbr;
        next.awayAbbr = awayAbbr;
        next.homeColor = homeColor;
        next.awayColor = awayColor;
        next.homeCrest = homeCrest;
        next.awayCrest = awayCrest;
        next.competition = competition;
        for (Marker marker : markers) next.markers.add(marker.copy());
        return next;
    }

    public String abbrHome() {
        return label(homeAbbr, homeFull.isEmpty() ? home : homeFull);
    }

    public String abbrAway() {
        return label(awayAbbr, awayFull.isEmpty() ? away : awayFull);
    }

    public String fullHome() {
        if (homeFull != null && !homeFull.isEmpty()) return homeFull;
        return home == null ? "" : home;
    }

    public String fullAway() {
        if (awayFull != null && !awayFull.isEmpty()) return awayFull;
        return away == null ? "" : away;
    }

    /** Same two-letter rule the board uses: first letters, or the first three of a single word. */
    public static String label(String abbr, String name) {
        if (abbr != null && !abbr.trim().isEmpty()) return clip(abbr);
        String source = name == null ? "" : name.replaceAll("[^A-Za-z ]", "").trim();
        String[] parts = source.split("\\s+");
        int words = 0;
        for (String part : parts) if (!part.isEmpty()) words++;
        if (words >= 2) {
            StringBuilder built = new StringBuilder();
            for (String part : parts) {
                if (part.isEmpty()) continue;
                built.append(Character.toUpperCase(part.charAt(0)));
                if (built.length() == 2) break;
            }
            return built.toString();
        }
        return clip(source);
    }

    public void addMarker(String type, int minute, String abbr) {
        addMarker(type, minute, abbr, "");
    }

    public void addMarker(String type, int minute, String abbr, String side) {
        if (type == null || type.isEmpty() || "goal".equals(type)) return;
        int at = Math.max(0, Math.min(130, minute));
        String tag = abbr == null ? "" : abbr;
        String team = side == null ? "" : side;
        for (Marker marker : markers) {
            if (type.equals(marker.type) && marker.minute == at && tag.equals(marker.abbr)) return;
        }
        Marker marker = new Marker();
        marker.type = type;
        marker.minute = at;
        marker.abbr = tag;
        marker.side = team;
        markers.add(marker);
    }

    /**
     * One goal on a side. The first minute sticks. A feed minute replaces an estimate.
     * Two goals in the same minute stay as two marks because the index differs.
     */
    public void setGoal(String side, int index, int minute, String abbr, String player, boolean fromFeed) {
        if (index <= 0 || minute < 0) return;
        String team = "away".equals(side) ? "away" : "home";
        int at = Math.max(0, Math.min(130, minute));
        String tag = abbr == null ? "" : abbr;
        String name = player == null ? "" : player.trim();
        for (Marker marker : markers) {
            if (!"goal".equals(marker.type) || marker.index != index || !team.equals(marker.side)) continue;
            if (fromFeed) {
                marker.minute = at;
                marker.estimated = false;
            }
            if (!tag.isEmpty()) marker.abbr = tag;
            if (!name.isEmpty()) marker.player = name;
            return;
        }
        Marker marker = new Marker();
        marker.type = "goal";
        marker.side = team;
        marker.index = index;
        marker.minute = at;
        marker.abbr = tag;
        marker.player = name;
        marker.estimated = !fromFeed;
        markers.add(marker);
    }

    /** Goals already on the scoreboard with no incident minute take the current match minute. */
    public void stampMissingGoals(int minute) {
        if (minute < 0 || "scheduled".equals(status) || "postponed".equals(status)) return;
        int home = homeScore == null ? 0 : Math.max(0, homeScore);
        int away = awayScore == null ? 0 : Math.max(0, awayScore);
        for (int index = countGoals("home") + 1; index <= home; index++) setGoal("home", index, minute, abbrHome(), "", false);
        for (int index = countGoals("away") + 1; index <= away; index++) setGoal("away", index, minute, abbrAway(), "", false);
    }

    private int countGoals(String side) {
        String team = "away".equals(side) ? "away" : "home";
        String abbr = "away".equals(team) ? abbrAway() : abbrHome();
        int count = 0;
        for (Marker marker : markers) {
            if (!"goal".equals(marker.type)) continue;
            if (team.equals(marker.side) || (marker.side.isEmpty() && abbr.equals(marker.abbr))) count++;
        }
        return count;
    }

    /** Keep crest, names, and pitch marks when a newer row only has the score. */
    public void keepDisplayFrom(WatchMatch prior) {
        if (prior == null) return;
        if (homeFull.isEmpty()) homeFull = prior.homeFull;
        if (awayFull.isEmpty()) awayFull = prior.awayFull;
        if (homeAbbr.isEmpty()) homeAbbr = prior.homeAbbr;
        if (awayAbbr.isEmpty()) awayAbbr = prior.awayAbbr;
        if (homeColor.isEmpty()) homeColor = prior.homeColor;
        if (awayColor.isEmpty()) awayColor = prior.awayColor;
        if (homeCrest.isEmpty()) homeCrest = prior.homeCrest;
        if (awayCrest.isEmpty()) awayCrest = prior.awayCrest;
        if (competition.isEmpty()) competition = prior.competition;
        if (markers.isEmpty()) {
            for (Marker marker : prior.markers) markers.add(marker.copy());
        } else {
            for (Marker marker : prior.markers) mergeMarker(marker);
        }
    }

    void mergeMarker(Marker prior) {
        if (prior == null) return;
        if ("goal".equals(prior.type)) {
            setGoal(prior.side.isEmpty() ? "home" : prior.side, prior.index > 0 ? prior.index : countGoals(prior.side.isEmpty() ? "home" : prior.side) + 1, prior.minute, prior.abbr, prior.player, !prior.estimated);
            return;
        }
        addMarker(prior.type, prior.minute, prior.abbr, prior.side);
    }

    private static String clip(String value) {
        String clean = value == null ? "" : value.trim().toUpperCase(Locale.US);
        if (clean.isEmpty()) return "TM";
        return clean.length() <= 3 ? clean : clean.substring(0, 3);
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
        json.put("homeFull", homeFull);
        json.put("awayFull", awayFull);
        json.put("homeAbbr", homeAbbr);
        json.put("awayAbbr", awayAbbr);
        json.put("homeColor", homeColor);
        json.put("awayColor", awayColor);
        json.put("homeCrest", homeCrest);
        json.put("awayCrest", awayCrest);
        json.put("competition", competition);
        JSONArray marks = new JSONArray();
        for (Marker marker : markers) {
            JSONObject row = new JSONObject();
            row.put("type", marker.type);
            row.put("minute", marker.minute);
            row.put("abbr", marker.abbr);
            row.put("side", marker.side);
            row.put("index", marker.index);
            row.put("player", marker.player);
            row.put("estimated", marker.estimated);
            marks.put(row);
        }
        json.put("markers", marks);
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
        match.homeFull = json.optString("homeFull", "");
        match.awayFull = json.optString("awayFull", "");
        match.homeAbbr = json.optString("homeAbbr", "");
        match.awayAbbr = json.optString("awayAbbr", "");
        match.homeColor = json.optString("homeColor", "");
        match.awayColor = json.optString("awayColor", "");
        match.homeCrest = json.optString("homeCrest", "");
        match.awayCrest = json.optString("awayCrest", "");
        match.competition = json.optString("competition", "");
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
        JSONArray marks = json.optJSONArray("markers");
        if (marks != null) {
            for (int i = 0; i < marks.length(); i++) {
                JSONObject row = marks.optJSONObject(i);
                if (row == null) continue;
                String type = row.optString("type", "");
                int at = row.optInt("minute", 0);
                String abbr = row.optString("abbr", "");
                if ("goal".equals(type)) {
                    String side = row.optString("side", "");
                    if (side.isEmpty()) side = abbr.equals(match.abbrAway()) ? "away" : "home";
                    int index = row.optInt("index", 0);
                    if (index <= 0) index = match.countGoals(side) + 1;
                    boolean estimated = !row.has("estimated") || row.optBoolean("estimated", true);
                    match.setGoal(side, index, at, abbr, row.optString("player", ""), !estimated);
                } else {
                    match.addMarker(type, at, abbr, row.optString("side", ""));
                }
            }
        }
        return match;
    }

    private static Integer integerOrNull(JSONObject json, String key) {
        if (!json.has(key) || json.isNull(key)) return null;
        return json.optInt(key);
    }
}

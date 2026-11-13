package com.betspapa.watch;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/** Shared with the WebView so a background alert is not raised again when the app opens. */
public final class WatchState {
    public static final Object FILE_LOCK = new Object();

    public boolean browser;
    public boolean kickoff = true;
    public boolean goal = true;
    public boolean ht = true;
    public boolean ft = true;
    public boolean varOn = true;
    public String goalSound = "crowd";
    /** auto follows the phone night mode. dark is the Red Ticker. light is the white score panel. */
    public String notificationStyle = "auto";
    public final List<String> matchIds = new ArrayList<String>();
    public final List<String> teamIds = new ArrayList<String>();
    public final List<String> trends = new ArrayList<String>();
    public final List<String> seen = new ArrayList<String>();
    public final List<String> sent = new ArrayList<String>();
    public final List<JSONObject> inbox = new ArrayList<JSONObject>();
    public final List<WatchMatch> matches = new ArrayList<WatchMatch>();
    public final List<String> muted = new ArrayList<String>();
    public final List<JSONObject> bookings = new ArrayList<JSONObject>();
    public long fixturesAt;
    /** Wall clock of the last poll that reached the feeds. Watchdog and Settings read this. */
    public long lastPollAt;

    public boolean muted(String matchId) {
        return matchId != null && !matchId.isEmpty() && muted.contains(matchId);
    }

    public void mute(String matchId) {
        if (matchId == null || matchId.isEmpty() || muted.contains(matchId)) return;
        muted.add(matchId);
    }

    public JSONObject bookingFor(String trendId) {
        if (trendId == null || trendId.isEmpty()) return null;
        JSONObject fallback = null;
        for (JSONObject row : bookings) {
            if (!trendId.equals(row.optString("id", ""))) continue;
            if (!row.optString("code", "").isEmpty()) return row;
            fallback = row;
        }
        return fallback;
    }

    public boolean hasInterest() {
        return !matchIds.isEmpty() || !teamIds.isEmpty() || !trends.isEmpty();
    }

    public boolean follows(WatchMatch match) {
        return matchIds.contains(match.id) || teamIds.contains(match.homeId) || teamIds.contains(match.awayId);
    }

    public boolean relevant(WatchMatch match) {
        if (follows(match)) return true;
        for (String trend : trends) {
            int cut = trend.lastIndexOf(':');
            if (cut > 0 && trend.substring(0, cut).equals(match.id)) return true;
        }
        return false;
    }

    public boolean allows(String kind) {
        if ("kickoff".equals(kind)) return kickoff;
        if ("goal".equals(kind)) return goal;
        if ("ht".equals(kind)) return ht;
        if ("ft".equals(kind)) return ft;
        if ("var".equals(kind)) return varOn;
        return "win".equals(kind);
    }

    public boolean seen(String id) {
        return seen.contains(id);
    }

    /** Move the confirmed score up to what the native feed just showed, unless that side is still under VAR. */
    public void commitScores() {
        for (WatchMatch match : matches) {
            boolean holdHome = holding(match, true);
            boolean holdAway = holding(match, false);
            if (!holdHome) match.seenHome = score(match.homeScore);
            else if (match.seenHome == null) match.seenHome = Math.max(0, score(match.homeScore) - 1);
            if (!holdAway) match.seenAway = score(match.awayScore);
            else if (match.seenAway == null) match.seenAway = Math.max(0, score(match.awayScore) - 1);
        }
    }

    private static boolean holding(WatchMatch match, boolean home) {
        if (match.varReview == null) return false;
        String id = home ? match.homeId : match.awayId;
        return id != null && id.equals(match.varReview.teamId);
    }

    private static int score(Integer value) {
        return value == null ? 0 : value;
    }

    public void record(WatchNote note, long now) {
        if (note == null || seen.contains(note.id)) return;
        JSONObject row = new JSONObject();
        row.put("id", note.id);
        row.put("matchId", note.matchId);
        row.put("kind", note.kind);
        row.put("title", note.title);
        row.put("body", note.body);
        row.put("createdAt", now);
        row.put("read", false);
        if (note.minute != null) row.put("minute", note.minute);
        if (note.player != null && !note.player.isEmpty()) row.put("player", note.player);
        if (note.varCheck) row.put("varCheck", true);
        if (note.disallowed) row.put("disallowed", true);
        if (note.marketLabel != null) row.put("marketLabel", note.marketLabel);
        if (note.oddsText != null) row.put("oddsText", note.oddsText);
        if (note.bookId != null) row.put("bookId", note.bookId);
        if (note.bookCode != null) row.put("bookCode", note.bookCode);
        if (note.fixture != null) row.put("fixture", note.fixture);
        inbox.add(0, row);
        seen.add(note.id);
        while (inbox.size() > 120) inbox.remove(inbox.size() - 1);
        trim(seen, 400);
    }

    public List<WatchNote> pendingNotifications() {
        List<WatchNote> pending = new ArrayList<WatchNote>();
        for (JSONObject row : inbox) {
            String id = row.optString("id", "");
            if (id.isEmpty() || sent.contains(id)) continue;
            WatchNote note = new WatchNote(id, row.optString("matchId", ""), row.optString("kind", ""), row.optString("title", ""), row.optString("body", ""));
            if (row.has("minute") && !row.isNull("minute")) note.minute = row.optInt("minute");
            note.player = row.optString("player", "");
            note.varCheck = row.optBoolean("varCheck", false);
            note.disallowed = row.optBoolean("disallowed", false);
            note.marketLabel = row.optString("marketLabel", "");
            note.oddsText = row.optString("oddsText", "");
            note.bookId = row.optString("bookId", "");
            note.bookCode = row.optString("bookCode", "");
            note.fixture = row.optString("fixture", "");
            pending.add(note);
        }
        return pending;
    }

    public void markSent(String id) {
        if (id == null || id.isEmpty() || sent.contains(id)) return;
        sent.add(id);
        trim(sent, 400);
    }

    public void merge(JSONObject patch) {
        if (patch == null) return;
        if (patch.has("browser")) browser = patch.optBoolean("browser", browser);
        JSONObject settings = patch.optJSONObject("settings");
        if (settings != null) {
            if (settings.has("kickoff")) kickoff = settings.optBoolean("kickoff", true);
            if (settings.has("goal")) goal = settings.optBoolean("goal", true);
            if (settings.has("ht")) ht = settings.optBoolean("ht", true);
            if (settings.has("ft")) ft = settings.optBoolean("ft", true);
            if (settings.has("var")) varOn = settings.optBoolean("var", true);
            if (settings.has("goalSound")) {
                String normalized = normalizeGoalSound(settings.optString("goalSound", ""));
                if (normalized != null) goalSound = normalized;
            }
            if (settings.has("notificationStyle")) notificationStyle = normalizeStyle(settings.optString("notificationStyle", "auto"));
        }
        JSONObject follows = patch.optJSONObject("follows");
        if (follows != null) {
            matchIds.clear();
            teamIds.clear();
            addStrings(matchIds, follows.optJSONArray("matches"));
            JSONArray teams = follows.optJSONArray("teams");
            if (teams != null) {
                for (int i = 0; i < teams.length(); i++) {
                    JSONObject team = teams.optJSONObject(i);
                    if (team == null) continue;
                    String id = team.optString("id", "").trim();
                    if (!id.isEmpty() && !teamIds.contains(id)) teamIds.add(id);
                }
            }
        }
        if (patch.has("trends")) {
            trends.clear();
            addStrings(trends, patch.optJSONArray("trends"));
        }
        union(seen, patch.optJSONArray("seen"), 400);
        union(sent, patch.optJSONArray("sent"), 400);
        if (patch.has("inbox")) mergeInbox(patch.optJSONArray("inbox"), patch.optBoolean("replaceInbox", false));
        if (patch.has("schedule")) replaceSchedule(patch.optJSONArray("schedule"), System.currentTimeMillis());
        if (patch.has("muted")) {
            muted.clear();
            addStrings(muted, patch.optJSONArray("muted"));
        }
        if (patch.has("bookings")) replaceBookings(patch.optJSONArray("bookings"));
    }

    public void replaceFromFeed(List<WatchMatch> upcoming, long now) {
        List<WatchMatch> incoming = new ArrayList<WatchMatch>();
        long horizon = 36L * 60L * 60L * 1000L;
        for (WatchMatch match : upcoming) {
            if (!relevant(match) || match.kickoffMs <= 0) continue;
            if (match.kickoffMs < now - AlertPlanner.TAIL_MS || match.kickoffMs > now + horizon) continue;
            incoming.add(match);
        }
        List<WatchMatch> previous = new ArrayList<WatchMatch>(matches);
        matches.clear();
        Set<String> seenIds = new HashSet<String>();
        for (WatchMatch match : incoming) {
            matches.add(prefer(find(previous, match.id), match));
            seenIds.add(match.id);
        }
        for (WatchMatch prior : previous) {
            if (seenIds.contains(prior.id) || !relevant(prior)) continue;
            if (keepWithoutFixture(prior, now)) matches.add(prior);
        }
        fixturesAt = now;
    }

    public void overlayLive(List<WatchMatch> live, long now) {
        Set<String> liveIds = new HashSet<String>();
        for (WatchMatch update : live) {
            WatchMatch prior = find(matches, update.id);
            if (prior == null && !relevant(update)) continue;
            liveIds.add(update.id);
            if (prior == null) {
                update.stampMissingGoals(update.minute == null ? -1 : update.minute);
                matches.add(update);
                continue;
            }
            noteMarkers(prior, update);
            prior.status = update.status;
            prior.minute = update.minute;
            prior.homeScore = update.homeScore;
            prior.awayScore = update.awayScore;
            prior.htHome = update.htHome;
            prior.htAway = update.htAway;
            prior.varReview = update.varReview;
            if (update.kickoffMs > 0) prior.kickoffMs = update.kickoffMs;
            if (!update.home.isEmpty() && (prior.home.isEmpty() || update.home.length() <= prior.home.length() + 1)) prior.home = update.home;
            if (!update.away.isEmpty() && (prior.away.isEmpty() || update.away.length() <= prior.away.length() + 1)) prior.away = update.away;
            if (prior.homeFull.isEmpty() || update.homeFull.length() > prior.homeFull.length()) {
                prior.homeFull = update.homeFull.isEmpty() ? update.home : update.homeFull;
            }
            if (prior.awayFull.isEmpty() || update.awayFull.length() > prior.awayFull.length()) {
                prior.awayFull = update.awayFull.isEmpty() ? update.away : update.awayFull;
            }
            if (!update.homeAbbr.isEmpty()) prior.homeAbbr = update.homeAbbr;
            if (!update.awayAbbr.isEmpty()) prior.awayAbbr = update.awayAbbr;
            if (!update.homeColor.isEmpty()) prior.homeColor = update.homeColor;
            if (!update.awayColor.isEmpty()) prior.awayColor = update.awayColor;
            if (!update.homeCrest.isEmpty()) prior.homeCrest = update.homeCrest;
            if (!update.awayCrest.isEmpty()) prior.awayCrest = update.awayCrest;
            if (!update.competition.isEmpty()) prior.competition = update.competition;
            if (!update.homeId.isEmpty()) prior.homeId = update.homeId;
            if (!update.awayId.isEmpty()) prior.awayId = update.awayId;
            for (WatchMatch.Marker marker : update.markers) prior.mergeMarker(marker);
            prior.stampMissingGoals(prior.minute == null ? -1 : prior.minute);
        }
        if (!live.isEmpty()) {
            for (WatchMatch match : matches) {
                if (liveIds.contains(match.id)) continue;
                if (!"live".equals(match.status) && !"halftime".equals(match.status)) continue;
                if (match.kickoffMs > 0 && now - match.kickoffMs > AlertPlanner.TAIL_MS) match.status = "finished";
            }
        }
    }

    public JSONObject toJson() {
        JSONObject json = new JSONObject();
        json.put("browser", browser);
        JSONObject settings = new JSONObject();
        settings.put("kickoff", kickoff);
        settings.put("goal", goal);
        settings.put("ht", ht);
        settings.put("ft", ft);
        settings.put("var", varOn);
        settings.put("goalSound", goalSound == null ? "crowd" : goalSound);
        settings.put("notificationStyle", notificationStyle == null ? "auto" : notificationStyle);
        json.put("settings", settings);
        JSONObject follows = new JSONObject();
        follows.put("matches", new JSONArray(matchIds));
        JSONArray teams = new JSONArray();
        for (String id : teamIds) {
            JSONObject team = new JSONObject();
            team.put("id", id);
            teams.put(team);
        }
        follows.put("teams", teams);
        json.put("follows", follows);
        json.put("trends", new JSONArray(trends));
        json.put("seen", new JSONArray(seen));
        json.put("sent", new JSONArray(sent));
        json.put("inbox", new JSONArray(inbox));
        JSONArray listed = new JSONArray();
        for (WatchMatch match : matches) listed.put(match.toJson());
        json.put("matches", listed);
        json.put("muted", new JSONArray(muted));
        json.put("bookings", new JSONArray(bookings));
        json.put("fixturesAt", fixturesAt);
        json.put("lastPollAt", lastPollAt);
        json.put("source", MatchFeeds.SOURCE_LABEL);
        return json;
    }

    public static WatchState fromJson(JSONObject json) {
        WatchState state = new WatchState();
        if (json == null) return state;
        state.merge(json);
        state.fixturesAt = json.optLong("fixturesAt", 0L);
        state.lastPollAt = json.optLong("lastPollAt", 0L);
        JSONArray listed = json.optJSONArray("matches");
        if (listed != null) {
            state.matches.clear();
            for (int i = 0; i < listed.length(); i++) {
                JSONObject row = listed.optJSONObject(i);
                if (row == null) continue;
                WatchMatch match = WatchMatch.fromJson(row);
                if (!match.id.isEmpty()) state.matches.add(match);
            }
        }
        return state;
    }

    public static WatchState load(File file) {
        synchronized (FILE_LOCK) {
            if (file == null || !file.isFile()) return new WatchState();
            FileInputStream input = null;
            try {
                input = new FileInputStream(file);
                ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                byte[] chunk = new byte[4096];
                int count;
                while ((count = input.read(chunk)) != -1) buffer.write(chunk, 0, count);
                return fromJson(new JSONObject(new String(buffer.toByteArray(), "UTF-8")));
            } catch (RuntimeException | IOException error) {
                return new WatchState();
            } finally {
                if (input != null) {
                    try {
                        input.close();
                    } catch (IOException ignored) {
                        /* the next load can try again */
                    }
                }
            }
        }
    }

    public void save(File file) throws IOException {
        synchronized (FILE_LOCK) {
            File parent = file.getParentFile();
            if (parent != null && !parent.isDirectory()) parent.mkdirs();
            File tmp = new File(parent, file.getName() + ".tmp");
            FileOutputStream output = new FileOutputStream(tmp);
            try {
                output.write(toJson().toString().getBytes("UTF-8"));
            } finally {
                output.close();
            }
            if (file.exists() && !file.delete()) throw new IOException("Could not replace watch state");
            if (!tmp.renameTo(file)) throw new IOException("Could not store watch state");
        }
    }

    private void replaceSchedule(JSONArray schedule, long now) {
        List<WatchMatch> incoming = new ArrayList<WatchMatch>();
        if (schedule != null) {
            for (int i = 0; i < schedule.length(); i++) {
                JSONObject row = schedule.optJSONObject(i);
                if (row == null) continue;
                WatchMatch match = WatchMatch.fromJson(row);
                if (!match.id.isEmpty()) incoming.add(match);
            }
        }
        List<WatchMatch> previous = new ArrayList<WatchMatch>(matches);
        matches.clear();
        Set<String> ids = new HashSet<String>();
        for (WatchMatch match : incoming) {
            matches.add(prefer(find(previous, match.id), match));
            ids.add(match.id);
        }
        for (WatchMatch prior : previous) {
            if (ids.contains(prior.id)) continue;
            if (keepWithoutFixture(prior, now)) matches.add(prior);
        }
        for (WatchMatch match : matches) acknowledgeDisplayed(match);
        if (fixturesAt == 0L) fixturesAt = now;
    }

    /**
     * The open app already shows this score, so a later background poll must not
     * replay those goals. A lower stale sync does not rewind a higher confirmed tally.
     */
    private void acknowledgeDisplayed(WatchMatch match) {
        int home = score(match.homeScore);
        int away = score(match.awayScore);
        int floorHome = match.seenHome == null ? 0 : match.seenHome;
        int floorAway = match.seenAway == null ? 0 : match.seenAway;
        for (int index = floorHome + 1; index <= home; index++) rememberSeen(match.id + ":goal:home:" + index);
        for (int index = floorAway + 1; index <= away; index++) rememberSeen(match.id + ":goal:away:" + index);
        match.seenHome = Math.max(floorHome, home);
        match.seenAway = Math.max(floorAway, away);
    }

    private void rememberSeen(String id) {
        if (id == null || id.isEmpty() || seen.contains(id)) return;
        seen.add(id);
        trim(seen, 400);
    }

    private static WatchMatch prefer(WatchMatch prior, WatchMatch incoming) {
        if (prior == null) {
            incoming.stampMissingGoals(incoming.minute == null ? -1 : incoming.minute);
            return incoming;
        }
        boolean incomingBlank = "scheduled".equals(incoming.status) && incoming.homeScore == null;
        boolean priorActive = "live".equals(prior.status) || "halftime".equals(prior.status) || "finished".equals(prior.status);
        if (incomingBlank && priorActive) {
            if (!incoming.home.isEmpty()) prior.home = incoming.home;
            if (!incoming.away.isEmpty()) prior.away = incoming.away;
            if (!incoming.homeId.isEmpty()) prior.homeId = incoming.homeId;
            if (!incoming.awayId.isEmpty()) prior.awayId = incoming.awayId;
            if (incoming.kickoffMs > 0) prior.kickoffMs = incoming.kickoffMs;
            return prior;
        }
        if (incoming.seenHome == null) incoming.seenHome = prior.seenHome;
        else if (prior.seenHome != null) incoming.seenHome = Math.max(incoming.seenHome, prior.seenHome);
        if (incoming.seenAway == null) incoming.seenAway = prior.seenAway;
        else if (prior.seenAway != null) incoming.seenAway = Math.max(incoming.seenAway, prior.seenAway);
        noteMarkers(prior, incoming);
        incoming.keepDisplayFrom(prior);
        int minute = incoming.minute == null ? (prior.minute == null ? -1 : prior.minute) : incoming.minute;
        incoming.stampMissingGoals(minute);
        return incoming;
    }

    /** Goals the watcher actually sees get a minute mark. A repeated score does not add another. */
    private static void noteMarkers(WatchMatch prior, WatchMatch update) {
        if (prior == null || update == null) return;
        int minute = update.minute == null ? (prior.minute == null ? -1 : prior.minute) : update.minute;
        int prevHome = prior.homeScore == null ? 0 : prior.homeScore;
        int prevAway = prior.awayScore == null ? 0 : prior.awayScore;
        int nextHome = update.homeScore == null ? prevHome : update.homeScore;
        int nextAway = update.awayScore == null ? prevAway : update.awayScore;
        if (minute >= 0) {
            for (int index = prevHome + 1; index <= nextHome; index++) prior.setGoal("home", index, minute, prior.abbrHome(), "", false);
            for (int index = prevAway + 1; index <= nextAway; index++) prior.setGoal("away", index, minute, prior.abbrAway(), "", false);
        }
        if (update.varReview != null) {
            boolean home = prior.homeId != null && prior.homeId.equals(update.varReview.teamId);
            prior.addMarker("var", update.varReview.minute, home ? prior.abbrHome() : prior.abbrAway(), home ? "home" : "away");
        }
    }

    private void replaceBookings(JSONArray incoming) {
        bookings.clear();
        if (incoming == null) return;
        for (int i = 0; i < incoming.length(); i++) {
            JSONObject row = incoming.optJSONObject(i);
            if (row == null || row.optString("id", "").isEmpty()) continue;
            bookings.add(row);
        }
    }

    private static boolean keepWithoutFixture(WatchMatch match, long now) {
        if ("live".equals(match.status) || "halftime".equals(match.status)) return true;
        return "finished".equals(match.status) && match.kickoffMs > 0 && now - match.kickoffMs <= AlertPlanner.TAIL_MS;
    }

    private static WatchMatch find(List<WatchMatch> matches, String id) {
        for (WatchMatch match : matches) {
            if (id.equals(match.id)) return match;
        }
        return null;
    }

    private void mergeInbox(JSONArray incoming, boolean replace) {
        if (replace) inbox.clear();
        if (incoming == null) return;
        List<JSONObject> rows = new ArrayList<JSONObject>();
        for (int i = 0; i < incoming.length(); i++) {
            JSONObject row = incoming.optJSONObject(i);
            if (row == null || row.optString("id", "").isEmpty()) continue;
            rows.add(row);
        }
        for (int i = rows.size() - 1; i >= 0; i--) {
            JSONObject row = rows.get(i);
            String id = row.optString("id", "");
            if (inboxId(id)) continue;
            inbox.add(0, row);
        }
        while (inbox.size() > 120) inbox.remove(inbox.size() - 1);
    }

    private boolean inboxId(String id) {
        for (JSONObject row : inbox) {
            if (id.equals(row.optString("id", ""))) return true;
        }
        return false;
    }

    static String normalizeGoalSound(String value) {
        if ("crowd".equals(value) || "afro".equals(value) || "chant".equals(value) || "papa".equals(value) || "off".equals(value)) return value;
        if ("cheer".equals(value)) return "crowd";
        return null;
    }

    public static String normalizeStyle(String value) {
        if ("dark".equals(value) || "light".equals(value) || "auto".equals(value)) return value;
        return "auto";
    }

    private static void addStrings(List<String> into, JSONArray incoming) {
        if (incoming == null) return;
        for (int i = 0; i < incoming.length(); i++) {
            String id = incoming.optString(i, "").trim();
            if (!id.isEmpty() && !into.contains(id)) into.add(id);
        }
    }

    private static void union(List<String> into, JSONArray incoming, int max) {
        addStrings(into, incoming);
        trim(into, max);
    }

    private static void trim(List<String> values, int max) {
        while (values.size() > max) values.remove(0);
    }

}

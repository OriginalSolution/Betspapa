package com.betspapa.scores.watch;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import com.betspapa.scores.MainActivity;
import com.betspapa.watch.AlertPlanner;
import com.betspapa.watch.WatchNote;

/** Opens one match, trend, or slip. The request code is unique per target so extras are not overwritten. */
public final class OpenMatch {
    public static final String EXTRA_MATCH = "matchId";
    public static final String EXTRA_ROUTE = "route";
    public static final String EXTRA_TREND = "trendId";

    private OpenMatch() {}

    static PendingIntent forNote(Context context, WatchNote note) {
        if (note == null) return view(context, "", "home", "", "open:home");
        if ("win".equals(note.kind) || "bust".equals(note.kind)) {
            String trendId = trendId(note);
            String matchId = note.matchId == null ? "" : note.matchId;
            if (matchId.isEmpty()) matchId = matchIdFromTrend(trendId);
            String key = "open:" + (note.id == null || note.id.isEmpty() ? trendId : note.id);
            if (!matchId.isEmpty()) return view(context, matchId, "match", trendId, key);
            boolean slip = note.bookCode != null && !note.bookCode.isEmpty();
            return view(context, "", slip ? "slip" : "trend", trendId, key);
        }
        String matchId = note.matchId == null ? "" : note.matchId;
        String key = "open:" + (note.id == null || note.id.isEmpty() ? matchId : note.id);
        return view(context, matchId, "match", "", key);
    }

    static PendingIntent view(Context context, String matchId, String route, String trendId) {
        String safeRoute = route == null || route.isEmpty() ? "match" : route;
        String safeMatch = matchId == null ? "" : matchId;
        String safeTrend = trendId == null ? "" : trendId;
        return view(context, safeMatch, safeRoute, safeTrend, "open:" + safeRoute + ":" + safeMatch + ":" + safeTrend);
    }

    private static PendingIntent view(Context context, String matchId, String route, String trendId, String key) {
        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        String safeRoute = route == null || route.isEmpty() ? "match" : route;
        String safeMatch = matchId == null ? "" : matchId;
        String safeTrend = trendId == null ? "" : trendId;
        open.putExtra(EXTRA_ROUTE, safeRoute);
        open.putExtra(EXTRA_MATCH, safeMatch);
        open.putExtra(EXTRA_TREND, safeTrend);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(context, AlertPlanner.notificationId(key == null ? "" : key), open, flags);
    }

    /** `sr:match:1:over25` keeps the match id and drops the market. */
    static String matchIdFromTrend(String trendId) {
        if (trendId == null || trendId.isEmpty()) return "";
        int cut = trendId.lastIndexOf(':');
        if (cut <= 0) return "";
        return trendId.substring(0, cut);
    }

    static String trendId(WatchNote note) {
        if (note == null || note.id == null) return "";
        String id = note.id;
        if (id.startsWith("trend:") && id.endsWith(":hit") && id.length() > "trend:".length() + ":hit".length()) {
            return id.substring("trend:".length(), id.length() - ":hit".length());
        }
        return "";
    }
}

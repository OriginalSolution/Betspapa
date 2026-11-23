package com.betspapa.scores.watch;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;
import androidx.annotation.RequiresApi;
import com.betspapa.scores.R;
import com.betspapa.watch.WatchMatch;
import com.betspapa.watch.WatchState;
import com.betspapa.watch.WidgetBoard;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Builds the widget for each size: one match (2x2, Fold cover), a few rows, or a list. */
final class WidgetRender {
    static final int LIVE_RED = 0xFFFF3B30;
    static final int MUTED = 0xFF8A90A0;
    /** Width where full short names fit beside the score. Narrower rows use abbreviations. */
    static final float FULL_NAMES_DP = 250f;
    /** Narrower than this shows a single match card. */
    static final float SINGLE_DP = 180f;
    private static final int CREST_DP = 24;

    private WidgetRender() {}

    static final class Board {
        final List<WatchMatch> rows = new ArrayList<WatchMatch>();
        final Map<String, Bitmap> crests = new HashMap<String, Bitmap>();
        boolean following;
        long fetchedAt;
        long now;
    }

    /** Followed matches from the widget's fetch and the live watcher, newest record wins. */
    static Board board(Context context, long now) {
        Board board = new Board();
        board.now = now;
        WatchState state = WatchState.load(WatchFiles.file(context));
        WidgetStore.Snapshot snapshot = WidgetStore.load(context);
        board.fetchedAt = Math.max(snapshot.fetchedAt, state.lastPollAt);
        board.following = !state.teamIds.isEmpty() || !state.matchIds.isEmpty();
        board.rows.addAll(WidgetBoard.rows(WidgetBoard.merge(snapshot.matches, state.matches), state, now));
        int size = dp(context, CREST_DP);
        for (WatchMatch match : board.rows) {
            crest(context, board, match.fullHome(), match.homeCrest, match.abbrHome(), match.homeColor, size);
            crest(context, board, match.fullAway(), match.awayCrest, match.abbrAway(), match.awayColor, size);
        }
        return board;
    }

    /** One Bitmap per team, shared by every size, so RemoteViews sends each crest once. */
    private static void crest(Context context, Board board, String name, String url, String abbr, String color, int size) {
        String key = name == null ? "" : name;
        if (board.crests.containsKey(key)) return;
        Bitmap bitmap;
        try {
            bitmap = CrestCache.badge(context, name, url, abbr, color, size);
        } catch (RuntimeException error) {
            bitmap = CrestCache.initials(abbr, color, name, size);
        }
        board.crests.put(key, bitmap);
    }

    @RequiresApi(31)
    static RemoteViews responsive(Context context, Board board) {
        Map<SizeF, RemoteViews> sizes = new LinkedHashMap<SizeF, RemoteViews>();
        sizes.put(new SizeF(100f, 80f), single(context, board));
        float[] heights = {80f, 130f, 180f, 260f, 350f};
        for (float width : new float[] {SINGLE_DP, FULL_NAMES_DP}) {
            for (float height : heights) {
                sizes.put(new SizeF(width, height), list(context, board, WidgetBoard.rowsFor(height), width >= FULL_NAMES_DP));
            }
        }
        return new RemoteViews(sizes);
    }

    /** Before Android 12: portrait width is the min width, portrait height the max height. */
    static RemoteViews forOptions(Context context, Board board, Bundle options) {
        int width = options == null ? 0 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
        int height = options == null ? 0 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
        return forSize(context, board, width, height);
    }

    static RemoteViews forSize(Context context, Board board, float widthDp, float heightDp) {
        if (widthDp <= 0f || heightDp <= 0f) return list(context, board, 2, false);
        if (widthDp < SINGLE_DP) return single(context, board);
        return list(context, board, WidgetBoard.rowsFor(heightDp), widthDp >= FULL_NAMES_DP);
    }

    static RemoteViews single(Context context, Board board) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_single);
        header(context, views, board, false);
        if (board.rows.isEmpty()) {
            empty(context, views, board, R.id.single_card);
            return views;
        }
        WatchMatch match = board.rows.get(0);
        views.setViewVisibility(R.id.widget_empty, View.GONE);
        views.setViewVisibility(R.id.single_card, View.VISIBLE);
        views.setImageViewBitmap(R.id.single_home_crest, board.crests.get(match.fullHome()));
        views.setImageViewBitmap(R.id.single_away_crest, board.crests.get(match.fullAway()));
        boolean live = WidgetBoard.live(match);
        views.setTextViewText(R.id.single_main, live ? WidgetBoard.score(match) : kickoffTime(context, match.kickoffMs));
        views.setTextViewText(R.id.single_teams, match.abbrHome() + " v " + match.abbrAway());
        String sub = live ? WidgetBoard.minute(match) : dayLabel(match.kickoffMs, board.now);
        views.setTextViewText(R.id.single_sub, sub);
        views.setTextColor(R.id.single_sub, live ? LIVE_RED : MUTED);
        views.setOnClickPendingIntent(R.id.single_card, OpenMatch.view(context, match.id, "match", ""));
        return views;
    }

    static RemoteViews list(Context context, Board board, int maxRows, boolean fullNames) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_list);
        header(context, views, board, fullNames);
        views.removeAllViews(R.id.widget_rows);
        if (board.rows.isEmpty()) {
            empty(context, views, board, R.id.widget_rows);
            return views;
        }
        views.setViewVisibility(R.id.widget_empty, View.GONE);
        views.setViewVisibility(R.id.widget_rows, View.VISIBLE);
        int count = Math.min(maxRows, board.rows.size());
        for (int i = 0; i < count; i++) views.addView(R.id.widget_rows, row(context, board, board.rows.get(i), fullNames));
        return views;
    }

    static RemoteViews row(Context context, Board board, WatchMatch match, boolean fullNames) {
        RemoteViews row = new RemoteViews(context.getPackageName(), R.layout.widget_row);
        boolean live = WidgetBoard.live(match);
        row.setImageViewBitmap(R.id.row_home_crest, board.crests.get(match.fullHome()));
        row.setImageViewBitmap(R.id.row_away_crest, board.crests.get(match.fullAway()));
        row.setTextViewText(R.id.row_home, fullNames ? shortName(match.home, match.fullHome()) : match.abbrHome());
        row.setTextViewText(R.id.row_away, fullNames ? shortName(match.away, match.fullAway()) : match.abbrAway());
        row.setTextViewText(R.id.row_main, live ? WidgetBoard.score(match) : kickoffTime(context, match.kickoffMs));
        row.setTextViewText(R.id.row_sub, live ? WidgetBoard.minute(match) : dayLabel(match.kickoffMs, board.now));
        row.setTextColor(R.id.row_sub, live ? LIVE_RED : MUTED);
        row.setOnClickPendingIntent(R.id.row_root, OpenMatch.view(context, match.id, "match", ""));
        return row;
    }

    private static void header(Context context, RemoteViews views, Board board, boolean showUpdated) {
        views.setOnClickPendingIntent(R.id.widget_brand, OpenMatch.view(context, "", "home", ""));
        views.setOnClickPendingIntent(R.id.widget_refresh, ScoreWidget.refreshIntent(context));
        boolean show = showUpdated && board.fetchedAt > 0;
        views.setViewVisibility(R.id.widget_updated, show ? View.VISIBLE : View.GONE);
        if (show) views.setTextViewText(R.id.widget_updated, kickoffTime(context, board.fetchedAt));
    }

    private static void empty(Context context, RemoteViews views, Board board, int content) {
        views.setViewVisibility(content, View.GONE);
        views.setViewVisibility(R.id.widget_empty, View.VISIBLE);
        views.setTextViewText(R.id.widget_empty, context.getString(board.following ? R.string.widget_no_matches : R.string.widget_empty));
        views.setOnClickPendingIntent(R.id.widget_empty, OpenMatch.view(context, "", "home", ""));
    }

    private static String shortName(String feed, String full) {
        if (feed != null && !feed.isEmpty()) return feed;
        return full == null ? "" : full;
    }

    /** Kick-off clock in the phone's own zone and 12/24-hour setting. */
    static String kickoffTime(Context context, long ms) {
        if (ms <= 0) return "";
        return android.text.format.DateFormat.getTimeFormat(context).format(new java.util.Date(ms));
    }

    /** "Today", "Tomorrow", or "Sat 28" in the phone's zone. */
    static String dayLabel(long kickoffMs, long now) {
        if (kickoffMs <= 0) return "";
        Calendar today = Calendar.getInstance();
        today.setTimeInMillis(now);
        Calendar day = Calendar.getInstance();
        day.setTimeInMillis(kickoffMs);
        int diff = dayIndex(day) - dayIndex(today);
        if (diff <= 0) return "Today";
        if (diff == 1) return "Tomorrow";
        return String.format(Locale.US, "%s %d", day.getDisplayName(Calendar.DAY_OF_WEEK, Calendar.SHORT, Locale.getDefault()), day.get(Calendar.DAY_OF_MONTH));
    }

    private static int dayIndex(Calendar calendar) {
        return calendar.get(Calendar.YEAR) * 400 + calendar.get(Calendar.DAY_OF_YEAR);
    }

    private static int dp(Context context, int value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }
}

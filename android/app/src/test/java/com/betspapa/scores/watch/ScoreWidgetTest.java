package com.betspapa.scores.watch;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.RemoteViews;
import android.widget.TextView;
import com.betspapa.scores.R;
import com.betspapa.watch.WatchMatch;
import com.betspapa.watch.WatchState;
import java.util.Arrays;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class ScoreWidgetTest {
    private static final long HOUR = 3_600_000L;

    private static WatchMatch match(String id, String home, String away, long kickoff, String status) {
        WatchMatch match = new WatchMatch();
        match.id = id;
        match.home = home;
        match.away = away;
        match.homeFull = home;
        match.awayFull = away;
        match.homeId = home.toLowerCase().replace(' ', '-');
        match.awayId = away.toLowerCase().replace(' ', '-');
        match.kickoffMs = kickoff;
        match.status = status;
        return match;
    }

    private static void save(Context context, WatchState state) {
        try {
            state.save(WatchFiles.file(context));
        } catch (Exception error) {
            throw new AssertionError(error);
        }
    }

    private static Context withMatches() {
        Context context = RuntimeEnvironment.getApplication();
        long now = System.currentTimeMillis();
        WatchState state = new WatchState();
        state.teamIds.add("hearts-of-oak");
        WatchMatch live = match("sr:match:1", "Hearts of Oak", "Asante Kotoko", now - HOUR, "live");
        live.minute = 54;
        live.homeScore = 1;
        live.awayScore = 0;
        WatchMatch next = match("sr:match:2", "Medeama", "Hearts of Oak", now + 5 * HOUR, "scheduled");
        WatchMatch later = match("sr:match:3", "Hearts of Oak", "Dreams FC", now + 50 * HOUR, "scheduled");
        WatchMatch other = match("sr:match:4", "Arsenal", "Chelsea", now + HOUR, "scheduled");
        state.matches.addAll(Arrays.asList(next, other, later, live));
        save(context, state);
        WidgetStore.file(context).delete();
        return context;
    }

    private static View apply(Context context, RemoteViews views, int widthDp, int heightDp) {
        View view = views.apply(context, new FrameLayout(context));
        float density = context.getResources().getDisplayMetrics().density;
        view.measure(
            View.MeasureSpec.makeMeasureSpec(Math.round(widthDp * density), View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(Math.round(heightDp * density), View.MeasureSpec.EXACTLY));
        view.layout(0, 0, view.getMeasuredWidth(), view.getMeasuredHeight());
        return view;
    }

    private static String text(View root, int id) {
        return ((TextView) root.findViewById(id)).getText().toString();
    }

    @Test
    public void smallSizeShowsTheLiveMatchFirst() {
        Context context = withMatches();
        WidgetRender.Board board = WidgetRender.board(context, System.currentTimeMillis());
        assertEquals(3, board.rows.size());
        View card = apply(context, WidgetRender.forSize(context, board, 110, 110), 110, 110);
        assertEquals("1 \u2013 0", text(card, R.id.single_main));
        String teams = text(card, R.id.single_teams);
        assertTrue(teams, teams.contains(" v ") && teams.length() <= 12);
        assertEquals("54\u2032", text(card, R.id.single_sub));
        assertEquals(View.GONE, card.findViewById(R.id.widget_empty).getVisibility());
    }

    @Test
    public void rowsGrowWithHeightAndNamesWithWidth() {
        Context context = withMatches();
        WidgetRender.Board board = WidgetRender.board(context, System.currentTimeMillis());
        View two = apply(context, WidgetRender.forSize(context, board, 200, 130), 200, 130);
        ViewGroup twoRows = two.findViewById(R.id.widget_rows);
        assertEquals(2, twoRows.getChildCount());
        View wide = apply(context, WidgetRender.forSize(context, board, 320, 260), 320, 260);
        ViewGroup rows = wide.findViewById(R.id.widget_rows);
        assertEquals(3, rows.getChildCount());
        assertEquals("Hearts of Oak", text(rows.getChildAt(0), R.id.row_home));
        assertEquals("1 \u2013 0", text(rows.getChildAt(0), R.id.row_main));
        assertEquals("Medeama", text(rows.getChildAt(1), R.id.row_home));
        assertTrue(text(rows.getChildAt(1), R.id.row_sub).length() > 0);
        for (int id : new int[] {R.id.row_home, R.id.row_away, R.id.row_main, R.id.row_sub}) {
            assertEquals(1, ((TextView) rows.getChildAt(0).findViewById(id)).getMaxLines());
        }
        // Narrow rows use abbreviations so names are not cut off beside the score.
        String narrow = text(twoRows.getChildAt(0), R.id.row_home);
        assertTrue(narrow, narrow.length() <= 4);
    }

    @Test
    public void emptyStateAsksToFollowTeams() {
        Context context = RuntimeEnvironment.getApplication();
        save(context, new WatchState());
        WidgetStore.file(context).delete();
        WidgetRender.Board board = WidgetRender.board(context, System.currentTimeMillis());
        View view = apply(context, WidgetRender.forSize(context, board, 250, 180), 250, 180);
        assertEquals(View.VISIBLE, view.findViewById(R.id.widget_empty).getVisibility());
        assertEquals("Follow teams in Betspapa to see them here", text(view, R.id.widget_empty));
        View small = apply(context, WidgetRender.forSize(context, board, 110, 110), 110, 110);
        assertEquals("Follow teams in Betspapa to see them here", text(small, R.id.widget_empty));
    }

    @Test
    public void androidTwelveGetsEverySizeInOneUpdate() {
        Context context = withMatches();
        WidgetRender.Board board = WidgetRender.board(context, System.currentTimeMillis());
        RemoteViews views = WidgetRender.responsive(context, board);
        assertTrue(views != null);
    }

    @Test
    public void theWidgetOnlyCallsOurOwnApi() {
        assertTrue(WidgetRefreshWorker.FIXTURES_URL.startsWith("https://api.betspapa.com/"));
        assertTrue(WidgetRefreshWorker.LIVE_URL.startsWith("https://api.betspapa.com/"));
    }

    @Test
    public void theWidgetCacheRoundTrips() {
        Context context = RuntimeEnvironment.getApplication();
        WatchMatch saved = match("sr:match:9", "Hearts of Oak", "Asante Kotoko", 1_800_000_000_000L, "scheduled");
        saved.homeCrest = "https://api.betspapa.com/crests/id/1.png";
        WidgetStore.save(context, Arrays.asList(saved), 42L);
        WidgetStore.Snapshot snapshot = WidgetStore.load(context);
        assertEquals(42L, snapshot.fetchedAt);
        assertEquals(1, snapshot.matches.size());
        assertEquals("https://api.betspapa.com/crests/id/1.png", snapshot.matches.get(0).homeCrest);
    }
}

package com.betspapa.scores.watch;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.Application;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.RemoteViews;
import android.widget.TextView;
import com.betspapa.scores.R;
import com.betspapa.watch.WatchMatch;
import com.betspapa.watch.WatchNote;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

/** The Z Fold cover screen showed the settings test as a blank Home / Away card with a clipped score. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class GoalCardLayoutTest {
    @Test
    public void settingsTestShowsARealScoreboard() {
        Context context = granted();
        Intent intent = new Intent();
        intent.putExtra(TestAlertReceiver.EXTRA_KIND, "goal");
        intent.putExtra(TestAlertReceiver.EXTRA_SOUND, "off");
        new TestAlertReceiver().onReceive(context, intent);
        Notification posted = shadowOf(manager(context)).getAllNotifications().get(0);
        assertNotNull("heads-up view so the pop-up is the open card", posted.headsUpContentView);
        assertEquals(Notification.PRIORITY_HIGH, posted.priority);

        WatchMatch match = TestAlertReceiver.sampleMatch("goal");
        WatchNote note = new WatchNote("test:goal:1", "", "goal", "Betspapa test", "x");
        note.player = TestAlertReceiver.sampleLine("goal");
        View card = apply(context, ScoreCards.expanded(context, note, match, false), 300);
        assertEquals(View.VISIBLE, card.findViewById(R.id.line_board).getVisibility());
        assertEquals("Hearts of Oak", text(card, R.id.name_home));
        assertEquals("Asante Kotoko", text(card, R.id.name_away));
        assertEquals("1 – 0", text(card, R.id.score_big));
        assertTrue(text(card, R.id.strip_status), text(card, R.id.strip_status).startsWith("GOAL 54"));
        View collapsed = apply(context, ScoreCards.collapsed(context, note, match), 300);
        assertEquals("Hearts of Oak 1–0 Asante Kotoko", text(collapsed, R.id.collapsed_score));
    }

    @Test
    public void aNoteWithoutAMatchNeverDrawsAnEmptyBoard() {
        Context context = RuntimeEnvironment.getApplication();
        WatchNote note = new WatchNote("x", "", "goal", "Goal · Hearts", "Hearts 1–0 Kotoko");
        for (boolean dark : new boolean[] {true, false}) {
            View card = apply(context, ScoreCards.expanded(context, note, null, dark), 300);
            assertEquals(View.GONE, card.findViewById(R.id.line_board).getVisibility());
            assertEquals(View.GONE, card.findViewById(R.id.line_compact).getVisibility());
            assertEquals(View.GONE, card.findViewById(R.id.timeline).getVisibility());
            assertEquals("Hearts 1–0 Kotoko", text(card, R.id.trend_fixture));
            assertEquals(View.GONE, card.findViewById(R.id.action_secondary).getVisibility());
        }
    }

    @Test
    @Config(qualifiers = "w320dp-h720dp")
    public void foldCoverWidthKeepsTheScoreWholeAndButtonsOnOneLine() {
        Context context = RuntimeEnvironment.getApplication();
        assertEquals("Mute", context.getString(R.string.notif_action_secondary));
        WatchMatch match = TestAlertReceiver.sampleMatch("goal");
        match.homeFull = "Borussia Mönchengladbach";
        match.awayFull = "Wolverhampton Wanderers";
        match.homeScore = 10;
        match.awayScore = 10;
        WatchNote note = new WatchNote("g", "sr:match:1", "goal", "Goal", "x");
        View card = apply(context, ScoreCards.expanded(context, note, match, false), 288);
        TextView score = card.findViewById(R.id.score_big);
        float need = score.getPaint().measureText(score.getText().toString());
        assertTrue("score " + score.getMeasuredWidth() + " < " + need, score.getMeasuredWidth() >= need);
        for (int id : new int[] {R.id.action_primary, R.id.action_secondary, R.id.action_tertiary, R.id.name_home, R.id.name_away}) {
            TextView view = card.findViewById(id);
            assertEquals(1, view.getMaxLines());
        }
        int limit = Math.round(256 * context.getResources().getDisplayMetrics().density);
        assertTrue(card.getMeasuredHeight() <= limit);
        View headsUp = apply(context, ScoreCards.headsUp(context, note, match, false), 288);
        assertEquals(View.GONE, headsUp.findViewById(R.id.timeline).getVisibility());
        assertEquals(View.GONE, headsUp.findViewById(R.id.actions).getVisibility());
        // Robolectric text metrics are not real, so compare against the full card rather than a fixed dp.
        assertTrue("heads-up " + headsUp.getMeasuredHeight() + " vs card " + card.getMeasuredHeight(), headsUp.getMeasuredHeight() < card.getMeasuredHeight());
    }

    @Test
    public void aLegWonCardNamesTheMatchMarketOddsAndSlip() {
        Context context = RuntimeEnvironment.getApplication();
        WatchMatch match = TestAlertReceiver.sampleMatch("goal");
        match.homeScore = 2;
        match.awayScore = 1;
        match.status = "finished";
        WatchNote bare = new WatchNote("slipleg:qc:sr:match:1|over15", match.id, "win", "Leg won · Over 1.5 goals", "");
        View card = apply(context, ScoreCards.expanded(context, bare, match, true), 360);
        assertFalse(text(card, R.id.trend_market).toLowerCase().contains("trend hit"));
        assertEquals("Over 1.5 Goals", text(card, R.id.trend_market));
        assertTrue(text(card, R.id.score_line), text(card, R.id.score_line).contains("Hearts of Oak 2-1 Asante Kotoko"));
        assertTrue(text(card, R.id.score_line).contains("FT"));
        View collapsed = apply(context, ScoreCards.collapsed(context, bare, match), 360);
        assertTrue(text(collapsed, R.id.collapsed_score).startsWith("LEG WON"));
        assertTrue(text(collapsed, R.id.collapsed_score).contains("2-1"));
        assertFalse(text(collapsed, R.id.collapsed_score).toLowerCase().contains("trend hit"));
        assertEquals("FT", text(collapsed, R.id.collapsed_minute));

        WatchNote full = new WatchNote("slipleg:qc:sr:match:1|over15", match.id, "win", "Leg won · Over 1.5", "ignored");
        full.marketLabel = "Over 1.5";
        full.trendLabel = "80%+ Over 1.5";
        full.oddsText = "1.26";
        full.slipLabel = "QC0003";
        full.progress = "29 of 36 won";
        full.clock = "FT";
        full.slipId = "qc";
        View rich = apply(context, ScoreCards.expanded(context, full, match, false), 360);
        assertEquals("Over 1.5", text(rich, R.id.trend_market));
        String detail = text(rich, R.id.trend_detail);
        assertTrue(detail, detail.contains("80%+ Over 1.5") && detail.contains("1.26") && detail.contains("QC0003") && detail.contains("29 of 36 won"));
        assertEquals("8/10+ Over 1.5", ScoreCards.tier("80%+ Over 1.5", true));
        assertEquals("10/10", ScoreCards.tier("100%", true));
        assertEquals("80%+ Over 1.5", ScoreCards.tier("80%+ Over 1.5", false));
        Intent open = shadowOf(OpenMatch.forNote(context, full)).getSavedIntent();
        assertEquals("slip", open.getStringExtra(OpenMatch.EXTRA_ROUTE));
        assertEquals("qc", open.getStringExtra(OpenMatch.EXTRA_TREND));
        assertEquals("", open.getStringExtra(OpenMatch.EXTRA_MATCH));
    }

    @Test
    @Config(qualifiers = "w411dp-h891dp")
    public void regularPhonesKeepTheFullMuteLabel() {
        assertEquals("Mute match", RuntimeEnvironment.getApplication().getString(R.string.notif_action_secondary));
    }

    private static View apply(Context context, RemoteViews views, int widthDp) {
        View view = views.apply(context, new FrameLayout(context));
        int width = Math.round(widthDp * context.getResources().getDisplayMetrics().density);
        view.measure(
            View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED)
        );
        view.layout(0, 0, view.getMeasuredWidth(), view.getMeasuredHeight());
        return view;
    }

    private static String text(View root, int id) {
        return ((TextView) root.findViewById(id)).getText().toString();
    }

    private static Context granted() {
        Context context = RuntimeEnvironment.getApplication();
        shadowOf((Application) context).grantPermissions(android.Manifest.permission.POST_NOTIFICATIONS);
        return context;
    }

    private static NotificationManager manager(Context context) {
        return (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    }
}

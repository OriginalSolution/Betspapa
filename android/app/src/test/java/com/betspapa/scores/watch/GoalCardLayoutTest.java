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
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.RemoteViews;
import android.widget.TextView;
import java.io.File;
import java.io.FileOutputStream;
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
        assertEquals("Hearts of Oak 2-1 Asante Kotoko · FT", text(collapsed, R.id.collapsed_score));
        assertTrue(text(collapsed, R.id.collapsed_sub).contains("Leg won"));
        assertFalse(text(collapsed, R.id.collapsed_score).toLowerCase().contains("trend hit"));
        assertTrue(text(collapsed, R.id.collapsed_score).contains("· FT"));
        assertEquals(View.GONE, collapsed.findViewById(R.id.collapsed_minute).getVisibility());

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
        // The Play bundle rewrites 80%+ to 8/10+ while this test runs. The sideload build keeps the percent.
        String tier = ScoreCards.tier("80%+ Over 1.5", com.betspapa.scores.BuildConfig.PLAY_STORE);
        assertTrue(detail, detail.contains(tier) && detail.contains("1.26") && detail.contains("QC0003") && detail.contains("29 of 36 won"));
        assertEquals("8/10+ Over 1.5", ScoreCards.tier("80%+ Over 1.5", true));
        assertEquals("10/10", ScoreCards.tier("100%", true));
        assertEquals("80%+ Over 1.5", ScoreCards.tier("80%+ Over 1.5", false));
        WatchNote empty = new WatchNote("slipleg:qc:sr:match:1|over15", match.id, "win", "Leg won", "Trend hit");
        empty.marketLabel = "Over 1.5";
        empty.trendLabel = "80%+ Over 1.5";
        empty.oddsText = "1.45";
        empty.slipLabel = "Daily slip";
        empty.progress = "29 of 36 won";
        empty.clock = "FT";
        empty.fixture = "Arsenal 2-1 Chelsea";
        View recovered = apply(context, ScoreCards.expanded(context, empty, null, true), 360);
        String recoveredText = text(recovered, R.id.trend_market) + " " + text(recovered, R.id.trend_fixture) + " " + text(recovered, R.id.trend_detail);
        assertFalse(recoveredText.toLowerCase().contains("trend hit"));
        assertTrue(recoveredText, recoveredText.contains("Over 1.5"));
        assertTrue(recoveredText, recoveredText.contains("1.45"));
        assertTrue(recoveredText, recoveredText.contains("29 of 36 won"));
        assertTrue(recoveredText, recoveredText.contains("Arsenal 2-1 Chelsea"));
        assertTrue(recoveredText, recoveredText.contains("FT"));
        assertEquals("Pick settled", ScoreCards.plainText(new WatchNote("x", "", "win", "Trend hit", "Trend hit"), null));
        assertFalse(ScoreCards.plainText(empty, null).toLowerCase().contains("trend hit"));

        Intent open = shadowOf(OpenMatch.forNote(context, full)).getSavedIntent();
        assertEquals("slip", open.getStringExtra(OpenMatch.EXTRA_ROUTE));
        assertEquals("qc", open.getStringExtra(OpenMatch.EXTRA_TREND));
        assertEquals("", open.getStringExtra(OpenMatch.EXTRA_MATCH));
    }

    @Test
    @Config(qualifiers = "w360dp-h800dp", sdk = 34)
    public void settleCardAt360ShowsTheScorePickTierOddsSlipAndCount() throws Exception {
        shotSettle(360);
    }

    @Test
    @Config(qualifiers = "w411dp-h891dp", sdk = 34)
    public void settleCardAt411ShowsTheScorePickTierOddsSlipAndCount() throws Exception {
        shotSettle(411);
    }

    private void shotSettle(int widthDp) throws Exception {
        Context context = RuntimeEnvironment.getApplication();
        WatchMatch match = new WatchMatch();
        match.id = "sr:match:1";
        match.home = "Arsenal";
        match.away = "Chelsea";
        match.homeFull = "Arsenal";
        match.awayFull = "Chelsea";
        match.homeScore = 2;
        match.awayScore = 1;
        match.status = "finished";
        match.minute = 90;
        WatchNote note = new WatchNote("slipleg:qc:sr:match:1|over15", match.id, "win", "Leg won · Over 1.5", "Trend hit");
        note.marketLabel = "Over 1.5";
        note.trendLabel = "80%+ Over 1.5";
        note.oddsText = "1.45";
        note.slipLabel = "Daily slip";
        note.progress = "29 of 36 won";
        note.clock = "FT";
        note.fixture = "Arsenal 2-1 Chelsea";
        note.slipId = "qc-slip";
        View collapsed = apply(context, ScoreCards.collapsed(context, note, match), widthDp);
        View expanded = apply(context, ScoreCards.expanded(context, note, match, true), widthDp);
        String collapsedText = text(collapsed, R.id.collapsed_score);
        String collapsedSub = text(collapsed, R.id.collapsed_sub);
        String expandedText = text(expanded, R.id.score_line) + " " + text(expanded, R.id.trend_market) + " " + text(expanded, R.id.trend_fixture) + " " + text(expanded, R.id.trend_detail);
        assertEquals("Arsenal 2-1 Chelsea · FT", collapsedText);
        assertTrue(collapsedSub, collapsedSub.contains("Leg won") && collapsedSub.contains("Over 1.5"));
        assertFalse(collapsedText.toLowerCase().contains("trend hit"));
        assertFalse(collapsedSub.toLowerCase().contains("trend hit"));
        assertTrue(expandedText, expandedText.contains("Arsenal 2-1 Chelsea · FT"));
        assertTrue(expandedText, expandedText.contains("Over 1.5") && expandedText.contains("1.45") && expandedText.contains("Daily slip") && expandedText.contains("29 of 36 won"));
        assertFalse(expandedText.toLowerCase().contains("trend hit"));
        assertFalse(expandedText.toLowerCase().contains("sportybet"));
        String tier = ScoreCards.tier("80%+ Over 1.5", com.betspapa.scores.BuildConfig.PLAY_STORE);
        assertTrue(expandedText, expandedText.contains(tier));
        save(collapsed, "settle-collapsed-" + widthDp);
        save(expanded, "settle-expanded-" + widthDp);
    }

    private static void save(View view, String name) throws Exception {
        File dir = new File("/opt/cursor/artifacts");
        if (!dir.isDirectory()) return;
        int width = Math.max(1, view.getWidth());
        int height = Math.max(1, view.getHeight());
        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        canvas.drawColor(0xFF07080C);
        paint(view, canvas);
        FileOutputStream output = new FileOutputStream(new File(dir, name + ".png"));
        try {
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, output);
        } finally {
            output.close();
        }
    }

    /** Robolectric does not rasterise a RemoteViews tree, so the pixels are drawn from the laid-out views. */
    private static void paint(View view, Canvas canvas) {
        if (view.getVisibility() != View.VISIBLE || view.getWidth() <= 0 || view.getHeight() <= 0) return;
        int save = canvas.save();
        canvas.translate(view.getLeft(), view.getTop());
        Drawable background = view.getBackground();
        if (background != null) {
            background.setBounds(0, 0, view.getWidth(), view.getHeight());
            background.draw(canvas);
        }
        if (view instanceof TextView) {
            TextView text = (TextView) view;
            String value = text.getText() == null ? "" : text.getText().toString();
            if (!value.isEmpty()) {
                text.getPaint().setColor(text.getCurrentTextColor());
                float y = text.getBaseline() > 0 ? text.getBaseline() : text.getPaddingTop() + text.getTextSize();
                canvas.drawText(value, text.getTotalPaddingLeft(), y, text.getPaint());
            }
        } else if (view instanceof ImageView) {
            Drawable drawable = ((ImageView) view).getDrawable();
            if (drawable != null) {
                int left = view.getPaddingLeft();
                int top = view.getPaddingTop();
                drawable.setBounds(left, top, view.getWidth() - view.getPaddingRight(), view.getHeight() - view.getPaddingBottom());
                drawable.draw(canvas);
            }
        }
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) paint(group.getChildAt(i), canvas);
        }
        canvas.restore();
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

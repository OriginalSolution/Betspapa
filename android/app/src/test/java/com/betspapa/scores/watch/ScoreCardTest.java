package com.betspapa.scores.watch;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.Application;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.RemoteViews;
import com.betspapa.watch.WatchMatch;
import com.betspapa.watch.WatchNote;
import com.betspapa.watch.WatchState;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowPendingIntent;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class ScoreCardTest {
    @Test
    public void autoFollowsNightModeAndOverridesWin() {
        Context context = RuntimeEnvironment.getApplication();
        Configuration config = new Configuration(context.getResources().getConfiguration());
        config.uiMode = (config.uiMode & ~Configuration.UI_MODE_NIGHT_MASK) | Configuration.UI_MODE_NIGHT_YES;
        context.getResources().updateConfiguration(config, context.getResources().getDisplayMetrics());
        assertTrue(NotifTheme.dark(context, "auto"));
        assertTrue(NotifTheme.dark(context, "dark"));
        assertFalse(NotifTheme.dark(context, "light"));
        config.uiMode = (config.uiMode & ~Configuration.UI_MODE_NIGHT_MASK) | Configuration.UI_MODE_NIGHT_NO;
        context.getResources().updateConfiguration(config, context.getResources().getDisplayMetrics());
        assertFalse(NotifTheme.dark(context, "auto"));
        assertFalse(NotifTheme.dark(context, null));
        assertTrue(NotifTheme.dark(context, "dark"));
    }

    @Test
    public void cardsStayWithinTheShadeLimits() {
        Context context = RuntimeEnvironment.getApplication();
        WatchMatch match = sample();
        WatchNote goal = goal(match);
        goal.varCheck = true;
        goal.player = "Saka";
        int collapsed = height(ScoreCards.collapsed(context, goal, match), context);
        int expandedDark = height(ScoreCards.expanded(context, goal, match, true), context);
        int expandedLight = height(ScoreCards.expanded(context, goal, match, false), context);
        WatchNote trend = new WatchNote("trend:1", match.id, "win", "Trend hit · Over 2.5 goals", "ARS vs CHE");
        trend.marketLabel = "Over 2.5 goals";
        trend.fixture = "ARS vs CHE";
        trend.oddsText = "1.72";
        trend.bookId = "sportybet";
        trend.bookCode = "N7KQ2X";
        int trendHeight = height(ScoreCards.expanded(context, trend, match, false), context);
        int limit64 = dp(context, 64);
        int limit256 = dp(context, 256);
        assertTrue("collapsed " + collapsed, collapsed > 0 && collapsed <= limit64);
        assertTrue("dark " + expandedDark, expandedDark > collapsed && expandedDark <= limit256);
        assertTrue("light " + expandedLight, expandedLight > collapsed && expandedLight <= limit256);
        assertTrue("trend " + trendHeight, trendHeight > 0 && trendHeight <= limit256);
    }

    @Test
    public void goalUsesTheDecoratedCardAndTheSelectedChannel() {
        Context context = granted();
        WatchMatch match = sample();
        save(context, match);
        WatchNote goal = goal(match);
        assertTrue(AlertPoster.post(context, goal, "chant"));
        Notification note = posted(context);
        assertEquals(AlertPoster.GOAL_CHANT, note.getChannelId());
        assertEquals("Goal · Arsenal", note.extras.getCharSequence(Notification.EXTRA_TITLE).toString());
        String template = note.extras.getString(Notification.EXTRA_TEMPLATE);
        assertTrue(template, template != null && template.contains("DecoratedCustomView"));
        assertFalse(ScoreCards.shareText(goal, match).toLowerCase().contains("sporty"));
        assertTrue(ScoreCards.shareText(goal, match).contains("Betspapa"));
        assertTrue(ScoreCards.shareText(goal, match).contains("Arsenal"));
    }

    @Test
    public void varClearsInPlaceAndADisallowReusesTheSameNotification() {
        Context context = granted();
        WatchMatch match = sample();
        match.varReview = new WatchMatch.VarReview();
        match.varReview.teamId = "arsenal";
        match.varReview.player = "Saka";
        match.varReview.minute = 54;
        save(context, match);
        WatchNote review = new WatchNote(match.id + ":var:54:Saka", match.id, "var", "VAR", "Saka 54′ · Arsenal goal under review");
        review.varCheck = true;
        review.player = "Saka";
        review.minute = 54;
        assertTrue(AlertPoster.post(context, review, "crowd"));
        assertEquals(1, shadowOf(manager(context)).getAllNotifications().size());

        WatchNote goal = goal(match);
        assertTrue(AlertPoster.post(context, goal, "crowd"));
        assertEquals(1, shadowOf(manager(context)).getAllNotifications().size());
        assertEquals("Goal · Arsenal", posted(context).extras.getCharSequence(Notification.EXTRA_TITLE).toString());
        assertEquals(AlertPoster.GOAL_CROWD, posted(context).getChannelId());

        WatchNote again = new WatchNote(match.id + ":var:70:Martinelli", match.id, "var", "VAR", "Martinelli under review");
        again.varCheck = true;
        again.player = "Martinelli";
        again.minute = 70;
        assertTrue(AlertPoster.post(context, again, "crowd"));
        match.varReview = null;
        save(context, match);
        AlertPoster.settleDisallowed(context);
        boolean disallowed = false;
        for (Notification note : shadowOf(manager(context)).getAllNotifications()) {
            if ("VAR".equals(String.valueOf(note.extras.getCharSequence(Notification.EXTRA_TITLE)))) disallowed = true;
        }
        assertTrue(disallowed);
    }

    @Test
    public void copyAndMuteStayOnThePhone() throws Exception {
        Context context = granted();
        Intent copy = new Intent(NotificationActionReceiver.ACTION_COPY);
        copy.putExtra(NotificationActionReceiver.EXTRA_CODE, "N7KQ2X");
        new NotificationActionReceiver().onReceive(context, copy);
        ClipboardManager clipboard = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
        ClipData clip = clipboard.getPrimaryClip();
        assertTrue(clip != null && clip.getItemCount() > 0);
        assertEquals("N7KQ2X", clip.getItemAt(0).getText().toString());

        Intent mute = new Intent(NotificationActionReceiver.ACTION_MUTE);
        mute.putExtra(NotificationActionReceiver.EXTRA_MATCH, "sr:match:ars");
        new NotificationActionReceiver().onReceive(context, mute);
        assertTrue(WatchState.load(WatchFiles.file(context)).muted("sr:match:ars"));

        WatchMatch match = sample();
        AlertPoster.postLive(context, match, false);
        AlertPoster.postLive(context, match, true);
        Notification live = null;
        for (Notification note : shadowOf(manager(context)).getAllNotifications()) {
            if (String.valueOf(note.extras.getCharSequence(Notification.EXTRA_TITLE)).startsWith("LIVE")) live = note;
        }
        assertTrue(live != null);
        assertTrue((live.flags & Notification.FLAG_ONLY_ALERT_ONCE) != 0);
        assertEquals(AlertPoster.SCORECARD, live.getChannelId());
    }

    @Test
    public void eachMatchKeepsItsOwnOpenTarget() {
        Context context = granted();
        WatchMatch arsenal = sample();
        WatchMatch ghana = sample();
        ghana.id = "sr:match:gha";
        ghana.home = "Ghana";
        ghana.away = "Somalia";
        AlertPoster.postLive(context, arsenal, false);
        AlertPoster.postLive(context, ghana, false);
        PendingIntent first = null;
        PendingIntent second = null;
        for (Notification note : shadowOf(manager(context)).getAllNotifications()) {
            String title = String.valueOf(note.extras.getCharSequence(Notification.EXTRA_TITLE));
            if (title.contains("Arsenal")) first = note.contentIntent;
            if (title.contains("Ghana")) second = note.contentIntent;
        }
        assertTrue(first != null && second != null);
        Intent arsenalIntent = shadowOf(first).getSavedIntent();
        Intent ghanaIntent = shadowOf(second).getSavedIntent();
        assertEquals("sr:match:ars", arsenalIntent.getStringExtra(OpenMatch.EXTRA_MATCH));
        assertEquals("match", arsenalIntent.getStringExtra(OpenMatch.EXTRA_ROUTE));
        assertEquals("sr:match:gha", ghanaIntent.getStringExtra(OpenMatch.EXTRA_MATCH));
        assertTrue(shadowOf(first).getRequestCode() != shadowOf(second).getRequestCode());
        assertTrue((shadowOf(first).getFlags() & PendingIntent.FLAG_IMMUTABLE) != 0);
        assertTrue((shadowOf(first).getFlags() & PendingIntent.FLAG_UPDATE_CURRENT) != 0);
        WatchNote trend = new WatchNote("trend:sr:match:gha:over25:hit", ghana.id, "win", "Trend hit · Over 2.5 goals", "Ghana");
        trend.bookCode = "N7KQ2X";
        PendingIntent slip = OpenMatch.forNote(context, trend);
        assertEquals("slip", shadowOf(slip).getSavedIntent().getStringExtra(OpenMatch.EXTRA_ROUTE));
        assertEquals("sr:match:gha:over25", shadowOf(slip).getSavedIntent().getStringExtra(OpenMatch.EXTRA_TREND));
        assertTrue(shadowOf(slip).getRequestCode() != shadowOf(second).getRequestCode());
    }

    private static Context granted() {
        Context context = RuntimeEnvironment.getApplication();
        shadowOf((Application) context).grantPermissions(android.Manifest.permission.POST_NOTIFICATIONS);
        return context;
    }

    private static WatchMatch sample() {
        WatchMatch match = new WatchMatch();
        match.id = "sr:match:ars";
        match.home = "Arsenal";
        match.away = "Chelsea";
        match.homeFull = "Arsenal";
        match.awayFull = "Chelsea";
        match.homeAbbr = "ARS";
        match.awayAbbr = "CHE";
        match.homeColor = "#e11d2e";
        match.awayColor = "#034694";
        match.competition = "Premier League";
        match.status = "live";
        match.minute = 54;
        match.homeScore = 2;
        match.awayScore = 1;
        match.addMarker("goal", 12, "ARS");
        match.addMarker("yellow", 22, "CHE");
        match.addMarker("goal", 31, "CHE");
        match.addMarker("var", 54, "ARS");
        return match;
    }

    private static WatchNote goal(WatchMatch match) {
        WatchNote note = new WatchNote(match.id + ":goal:home:2", match.id, "goal", "Goal · Arsenal", "Arsenal score · Arsenal 2–1 Chelsea");
        note.minute = 54;
        note.player = "Saka";
        return note;
    }

    private static void save(Context context, WatchMatch match) {
        try {
            WatchState state = new WatchState();
            state.browser = true;
            state.notificationStyle = "dark";
            state.matches.add(match);
            state.save(WatchFiles.file(context));
        } catch (Exception error) {
            throw new AssertionError(error);
        }
    }

    private static Notification posted(Context context) {
        return shadowOf(manager(context)).getAllNotifications().get(0);
    }

    private static NotificationManager manager(Context context) {
        return (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    }

    private static int height(RemoteViews views, Context context) {
        View view = views.apply(context, new FrameLayout(context));
        int width = dp(context, 360);
        view.measure(
            View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED)
        );
        return view.getMeasuredHeight();
    }

    private static int dp(Context context, int value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }
}

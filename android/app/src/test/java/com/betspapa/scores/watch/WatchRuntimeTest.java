package com.betspapa.scores.watch;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.Application;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import com.betspapa.watch.MatchFeeds;
import com.betspapa.watch.WatchMatch;
import com.betspapa.watch.WatchState;
import java.io.File;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import okhttp3.mockwebserver.Dispatcher;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class WatchRuntimeTest {
    private final MockWebServer server = new MockWebServer();

    @After
    public void tearDown() throws Exception {
        WatchScheduler.noteUiForeground(false);
        FeedClient.overrideFeeds(null, null);
        server.shutdown();
    }

    @Test
    public void aScoreChangePostsTheGoalChannelAfterTheLastSeenScore() throws Exception {
        Context context = RuntimeEnvironment.getApplication();
        shadowOf((Application) context).grantPermissions(android.Manifest.permission.POST_NOTIFICATIONS);
        AtomicReference<String> score = new AtomicReference<String>("0:0");
        server.setDispatcher(new Dispatcher() {
            @Override
            public MockResponse dispatch(RecordedRequest request) {
                String body = "{\"data\":[{\"name\":\"Cup\",\"events\":[{\"eventId\":\"sr:match:1\",\"homeTeamName\":\"Hearts\",\"awayTeamName\":\"Kotoko\",\"estimateStartTime\":" + System.currentTimeMillis() + ",\"status\":1,\"matchStatus\":\"H1\",\"playedSeconds\":\"12:00\",\"setScore\":\"" + score.get() + "\"}]}]}";
                return new MockResponse().setResponseCode(200).setBody(body);
            }
        });
        server.start();
        FeedClient.overrideFeeds(server.url("/fixtures").toString(), server.url("/live").toString());
        save(context, 0, 0);

        WatchRuntime.PollResult quiet = WatchRuntime.pollOnce(context);
        assertTrue(quiet.hot);
        assertEquals(0, goalCount(context));
        assertEquals(1, liveCount(context));

        // HiOS can leave the activity resumed while the user is in another app.
        // That used to force the silent channel. The persisted cheer still has to play.
        WatchScheduler.noteUiForeground(true);
        score.set("1:0");
        WatchRuntime.PollResult scored = WatchRuntime.pollOnce(context);
        assertTrue(scored.hot);
        Notification goal = goalNamed(context);
        assertTrue(goal != null);
        assertEquals("Goal · Hearts", goal.extras.getCharSequence(Notification.EXTRA_TITLE).toString());
        assertTrue(goal.extras.getCharSequence(Notification.EXTRA_TEXT).toString().contains("Kotoko"));
        assertEquals(AlertPoster.GOAL_CROWD, goal.getChannelId());
        assertEquals("android.resource://" + context.getPackageName() + "/raw/cheer_crowd", String.valueOf(goal.sound));
        assertEquals(0, goal.flags & Notification.FLAG_ONLY_ALERT_ONCE);
        assertEquals(1, liveCount(context));

        WatchRuntime.pollOnce(context);
        assertEquals(1, goalCount(context));
        assertEquals(1, liveCount(context));
    }

    @Test
    public void varReviewHoldsTheGoalUntilItClears() throws Exception {
        Context context = RuntimeEnvironment.getApplication();
        shadowOf((Application) context).grantPermissions(android.Manifest.permission.POST_NOTIFICATIONS);
        AtomicReference<Boolean> review = new AtomicReference<Boolean>(true);
        server.setDispatcher(new Dispatcher() {
            @Override
            public MockResponse dispatch(RecordedRequest request) {
                String var = review.get() ? "\"varReview\":{\"teamId\":\"hearts\",\"player\":\"Striker\",\"minute\":12}," : "";
                String body = "{\"data\":[{\"name\":\"Cup\",\"events\":[{\"eventId\":\"sr:match:1\",\"homeTeamName\":\"Hearts\",\"awayTeamName\":\"Kotoko\",\"estimateStartTime\":" + System.currentTimeMillis() + ",\"status\":1,\"matchStatus\":\"H1\",\"playedSeconds\":\"12:00\"," + var + "\"setScore\":\"1:0\"}]}]}";
                return new MockResponse().setResponseCode(200).setBody(body);
            }
        });
        server.start();
        FeedClient.overrideFeeds(null, server.url("/live").toString());
        save(context, 0, 0);

        WatchRuntime.pollOnce(context);
        assertEquals(0, goalCount(context));
        review.set(false);
        WatchRuntime.pollOnce(context);
        Notification goal = null;
        for (Notification note : notifications(context)) {
            if ("Goal · Hearts".equals(String.valueOf(note.extras.getCharSequence(Notification.EXTRA_TITLE)))) goal = note;
        }
        assertTrue(goal != null);
        assertEquals(AlertPoster.GOAL_CROWD, goal.getChannelId());
    }

    @Test
    public void releaseBuildIgnoresAFeedOverrideFile() throws Exception {
        Context context = RuntimeEnvironment.getApplication();
        ApplicationInfo info = context.getApplicationInfo();
        int original = info.flags;
        File file = new File(context.getFilesDir(), FeedClient.OVERRIDE_FILE);
        FileOutputStream output = new FileOutputStream(file);
        output.write("{\"live\":\"http://127.0.0.1:9/live\",\"fixtures\":\"http://127.0.0.1:9/fixtures\"}".getBytes("UTF-8"));
        output.close();
        try {
            info.flags = original & ~ApplicationInfo.FLAG_DEBUGGABLE;
            assertFalse((context.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0);
            assertEquals(MatchFeeds.LIVE, FeedClient.resolve(context, MatchFeeds.LIVE));
            assertEquals(MatchFeeds.FIXTURES, FeedClient.resolve(context, MatchFeeds.FIXTURES));
            info.flags = original | ApplicationInfo.FLAG_DEBUGGABLE;
            assertEquals("http://127.0.0.1:9/live", FeedClient.resolve(context, MatchFeeds.LIVE));
        } finally {
            info.flags = original;
            file.delete();
        }
    }

    private static void save(Context context, int home, int away) throws Exception {
        WatchState state = new WatchState();
        state.browser = true;
        state.goalSound = "crowd";
        state.matchIds.add("sr:match:1");
        state.seen.add("sr:match:1:kickoff");
        state.fixturesAt = System.currentTimeMillis();
        WatchMatch match = new WatchMatch();
        match.id = "sr:match:1";
        match.home = "Hearts";
        match.away = "Kotoko";
        match.homeId = "hearts";
        match.awayId = "kotoko";
        match.kickoffMs = System.currentTimeMillis() - 60_000L;
        match.status = "live";
        match.minute = 12;
        match.homeScore = home;
        match.awayScore = away;
        match.seenHome = home;
        match.seenAway = away;
        state.matches.add(match);
        state.save(WatchFiles.file(context));
    }

    private static List<Notification> notifications(Context context) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        return new ArrayList<Notification>(shadowOf(manager).getAllNotifications());
    }

    private static int goalCount(Context context) {
        int goals = 0;
        for (Notification note : notifications(context)) {
            if ("Goal · Hearts".equals(String.valueOf(note.extras.getCharSequence(Notification.EXTRA_TITLE)))) goals++;
        }
        return goals;
    }

    private static Notification goalNamed(Context context) {
        for (Notification note : notifications(context)) {
            if ("Goal · Hearts".equals(String.valueOf(note.extras.getCharSequence(Notification.EXTRA_TITLE)))) return note;
        }
        return null;
    }

    private static int liveCount(Context context) {
        int live = 0;
        for (Notification note : notifications(context)) {
            String title = String.valueOf(note.extras.getCharSequence(Notification.EXTRA_TITLE));
            if (title.startsWith("LIVE")) live++;
        }
        return live;
    }
}

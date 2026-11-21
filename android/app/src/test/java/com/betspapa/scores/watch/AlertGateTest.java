package com.betspapa.scores.watch;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.Application;
import android.app.NotificationManager;
import android.content.Context;
import com.betspapa.watch.AlertPlanner;
import com.betspapa.watch.WatchNote;
import com.betspapa.watch.WatchState;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class AlertGateTest {
    @Test
    public void onlyOnePathPostsAnIdAndASentIdIsNeverPostedAgain() {
        Context context = RuntimeEnvironment.getApplication();
        WatchFiles.file(context).delete();
        assertTrue(AlertGate.claim(context, "sr:match:1:goal:home:1"));
        // FCM and the poller landing together: the second caller is turned away while the first posts.
        assertFalse(AlertGate.claim(context, "sr:match:1:goal:home:1"));
        AlertGate.finish(context, "sr:match:1:goal:home:1", true);
        assertFalse(AlertGate.claim(context, "sr:match:1:goal:home:1"));
        assertTrue(WatchState.load(WatchFiles.file(context)).sent.contains("sr:match:1:goal:home:1"));
        // A card that failed to post can be tried again.
        assertTrue(AlertGate.claim(context, "sr:match:1:goal:home:2"));
        AlertGate.finish(context, "sr:match:1:goal:home:2", false);
        assertTrue(AlertGate.claim(context, "sr:match:1:goal:home:2"));
        AlertGate.finish(context, "sr:match:1:goal:home:2", false);
    }

    @Test
    public void lateLiveCardsAreStaleButTrendHitsLastLonger() {
        assertTrue(AlertGate.stale("goal", 16L * 60_000L));
        assertFalse(AlertGate.stale("goal", 2L * 60_000L));
        assertFalse(AlertGate.stale("win", 30L * 60_000L));
        assertFalse(AlertGate.stale("promo", 10L * 60L * 60_000L));
    }

    @Test
    public void disallowedCardReplacesTheGoalCard() {
        Application app = RuntimeEnvironment.getApplication();
        shadowOf(app).grantPermissions(android.Manifest.permission.POST_NOTIFICATIONS);
        NotificationManager manager = app.getSystemService(NotificationManager.class);
        WatchNote goal = new WatchNote("sr:match:1:goal:home:1", "sr:match:1", "goal", "Goal · Hearts", "Hearts score");
        assertTrue(AlertPoster.post(app, goal, "crowd"));
        assertEquals(1, shadowOf(manager).getActiveNotifications().length);
        WatchNote cancelled = new WatchNote("sr:match:1:goal:home:1:cancelled", "sr:match:1", "var", "VAR · Hearts", "Goal disallowed");
        cancelled.disallowed = true;
        cancelled.replaces = "sr:match:1:goal:home:1";
        assertTrue(AlertPoster.post(app, cancelled, "crowd"));
        assertEquals(1, shadowOf(manager).getActiveNotifications().length);
        assertEquals(AlertPlanner.notificationId("sr:match:1:goal:home:1"), shadowOf(manager).getActiveNotifications()[0].getId());
        assertEquals(AlertPoster.GOAL_OFF, shadowOf(manager).getActiveNotifications()[0].getNotification().getChannelId());
    }

    @Test
    public void refreshedTokenResendsTheLastRegistrationAndNamesTheOldToken() throws Exception {
        assertNull(DeviceRegistrar.body("", "new-token", "old-token"));
        JSONObject body = new JSONObject(DeviceRegistrar.body("{\"token\":\"old-token\",\"trends\":[\"sr:match:1:over15\"]}", "new-token", "old-token"));
        assertEquals("new-token", body.getString("token"));
        assertEquals("old-token", body.getString("previousToken"));
        assertEquals("sr:match:1:over15", body.getJSONArray("trends").getString(0));
    }
}

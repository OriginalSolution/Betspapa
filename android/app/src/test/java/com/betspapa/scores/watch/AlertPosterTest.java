package com.betspapa.scores.watch;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.Activity;
import android.app.Application;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import com.betspapa.watch.WatchNote;
import java.util.List;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class AlertPosterTest {
    @Test
    public void postsAGoalAfterTheActivityIsGone() {
        ActivityController<Activity> controller = Robolectric.buildActivity(Activity.class).setup();
        controller.pause().stop().destroy();
        assertTrue(controller.get().isDestroyed());

        Context context = RuntimeEnvironment.getApplication();
        shadowOf((Application) context).grantPermissions(android.Manifest.permission.POST_NOTIFICATIONS);
        boolean posted = AlertPoster.post(
            context,
            new WatchNote("qc:goal", "sr:match:1", "goal", "Goal · Hearts", "Hearts score · Hearts 1–0 Kotoko")
        );
        assertTrue(posted);

        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        List<Notification> notes = shadowOf(manager).getAllNotifications();
        assertEquals(1, notes.size());
        assertEquals("Goal · Hearts", notes.get(0).extras.getCharSequence(Notification.EXTRA_TITLE).toString());
        assertTrue(notes.get(0).extras.getCharSequence(Notification.EXTRA_TEXT).toString().contains("Kotoko"));
        assertEquals(AlertPoster.GOAL_CROWD, notes.get(0).getChannelId());
        assertEquals(
            "android.resource://" + context.getPackageName() + "/" + com.betspapa.scores.R.raw.cheer_crowd,
            AlertPoster.soundFor(context, "goal", "crowd").toString()
        );

        Notification watching = AlertPoster.watching(context, false);
        assertEquals("Watching live scores", watching.extras.getCharSequence(Notification.EXTRA_TITLE).toString());
        assertTrue(watching.extras.getCharSequence(Notification.EXTRA_TEXT).toString().contains("Betspapa"));
        assertEquals(AlertPoster.WATCH, watching.getChannelId());
    }

    @Test
    public void goalChannelsUseTheSelectedCheer() {
        Context context = RuntimeEnvironment.getApplication();
        shadowOf((Application) context).grantPermissions(android.Manifest.permission.POST_NOTIFICATIONS);
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);

        assertTrue(AlertPoster.post(context, new WatchNote("qc:afro", "sr:match:1", "goal", "Goal", "Afrobeats"), "afro"));
        assertTrue(AlertPoster.post(context, new WatchNote("qc:chant", "sr:match:1", "goal", "Goal", "Chant"), "chant"));
        assertTrue(AlertPoster.post(context, new WatchNote("qc:off", "sr:match:1", "goal", "Goal", "Silent"), "off"));
        assertTrue(AlertPoster.post(context, new WatchNote("qc:kick", "sr:match:1", "kickoff", "Kick-off", "Hearts"), "chant"));

        assertEquals(
            "android.resource://" + context.getPackageName() + "/" + com.betspapa.scores.R.raw.cheer_afro,
            AlertPoster.soundFor(context, "goal", "afro").toString()
        );
        assertEquals(
            "android.resource://" + context.getPackageName() + "/" + com.betspapa.scores.R.raw.cheer_chant,
            AlertPoster.soundFor(context, "goal", "chant").toString()
        );
        assertEquals(null, AlertPoster.soundFor(context, "goal", "off"));
        assertEquals(null, AlertPoster.soundFor(context, "kickoff", "chant"));
        NotificationChannel silent = manager.getNotificationChannel(AlertPoster.GOAL_OFF);
        assertEquals(null, silent.getSound());

        String afroId = null;
        String chantId = null;
        String offId = null;
        String kickId = null;
        for (Notification note : shadowOf(manager).getAllNotifications()) {
            String title = String.valueOf(note.extras.getCharSequence(Notification.EXTRA_TEXT));
            if ("Afrobeats".equals(title)) afroId = note.getChannelId();
            if ("Chant".equals(title)) chantId = note.getChannelId();
            if ("Silent".equals(title)) offId = note.getChannelId();
            if ("Hearts".equals(title)) kickId = note.getChannelId();
        }
        assertEquals(AlertPoster.GOAL_AFRO, afroId);
        assertEquals(AlertPoster.GOAL_CHANT, chantId);
        assertEquals(AlertPoster.GOAL_OFF, offId);
        assertEquals(AlertPoster.ALERTS, kickId);
    }
}

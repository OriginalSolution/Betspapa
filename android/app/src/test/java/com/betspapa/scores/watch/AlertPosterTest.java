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
import android.media.AudioAttributes;
import android.net.Uri;
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
        assertEquals(0, notes.get(0).flags & Notification.FLAG_ONLY_ALERT_ONCE);
        assertEquals(Notification.GROUP_ALERT_CHILDREN, notes.get(0).getGroupAlertBehavior());
        assertEquals(
            "android.resource://" + context.getPackageName() + "/raw/cheer_crowd",
            AlertPoster.soundFor(context, "goal", "crowd").toString()
        );
        assertEquals(notes.get(0).sound, AlertPoster.soundFor(context, "goal", "crowd"));

        Notification watching = AlertPoster.watching(context, 2, false);
        assertEquals("Betspapa is watching 2 live matches", watching.extras.getCharSequence(Notification.EXTRA_TITLE).toString());
        assertTrue(watching.extras.getCharSequence(Notification.EXTRA_TEXT).toString().contains("closed"));
        assertEquals(AlertPoster.WATCH, watching.getChannelId());
        Notification soon = AlertPoster.watching(context, 0, true);
        assertEquals("Watching live scores", soon.extras.getCharSequence(Notification.EXTRA_TITLE).toString());
        assertTrue(soon.extras.getCharSequence(Notification.EXTRA_TEXT).toString().contains("kick off"));
    }

    @Test
    public void goalChannelsUseTheSelectedCheer() {
        Context context = RuntimeEnvironment.getApplication();
        shadowOf((Application) context).grantPermissions(android.Manifest.permission.POST_NOTIFICATIONS);
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);

        assertTrue(AlertPoster.post(context, new WatchNote("qc:afro", "sr:match:1", "goal", "Goal", "Afrobeats"), "afro"));
        assertTrue(AlertPoster.post(context, new WatchNote("qc:chant", "sr:match:1", "goal", "Goal", "Chant"), "chant"));
        assertTrue(AlertPoster.post(context, new WatchNote("qc:papa", "sr:match:1", "goal", "Goal", "Papa"), "papa"));
        assertTrue(AlertPoster.post(context, new WatchNote("qc:off", "sr:match:1", "goal", "Goal", "Silent"), "off"));
        assertTrue(AlertPoster.post(context, new WatchNote("qc:kick", "sr:match:1", "kickoff", "Kick-off", "Hearts"), "chant"));

        assertEquals(
            "android.resource://" + context.getPackageName() + "/raw/cheer_afro",
            AlertPoster.soundFor(context, "goal", "afro").toString()
        );
        assertEquals(
            "android.resource://" + context.getPackageName() + "/raw/cheer_chant",
            AlertPoster.soundFor(context, "kickoff", "chant").toString()
        );
        assertEquals(
            "android.resource://" + context.getPackageName() + "/raw/cheer_papa",
            AlertPoster.soundFor(context, "ft", "papa").toString()
        );
        assertEquals(null, AlertPoster.soundFor(context, "goal", "off"));
        assertEquals(
            "android.resource://" + context.getPackageName() + "/raw/cheer_afro",
            AlertPoster.soundFor(context, "win", "afro").toString()
        );
        NotificationChannel silent = manager.getNotificationChannel(AlertPoster.GOAL_OFF);
        assertEquals(null, silent.getSound());

        String afroId = null;
        String chantId = null;
        String papaId = null;
        String offId = null;
        String kickId = null;
        for (Notification note : shadowOf(manager).getAllNotifications()) {
            String title = String.valueOf(note.extras.getCharSequence(Notification.EXTRA_TEXT));
            if ("Afrobeats".equals(title)) afroId = note.getChannelId();
            if ("Chant".equals(title)) chantId = note.getChannelId();
            if ("Papa".equals(title)) papaId = note.getChannelId();
            if ("Silent".equals(title)) offId = note.getChannelId();
            if ("Hearts".equals(title)) kickId = note.getChannelId();
        }
        assertEquals(AlertPoster.GOAL_AFRO, afroId);
        assertEquals(AlertPoster.GOAL_CHANT, chantId);
        assertEquals(AlertPoster.GOAL_PAPA, papaId);
        assertEquals(AlertPoster.GOAL_OFF, offId);
        assertEquals(AlertPoster.GOAL_CHANT, kickId);
        NotificationChannel crowd = manager.getNotificationChannel(AlertPoster.GOAL_CROWD);
        assertEquals(NotificationManager.IMPORTANCE_HIGH, crowd.getImportance());
        assertEquals("android.resource://" + context.getPackageName() + "/raw/cheer_crowd", crowd.getSound().toString());
        assertEquals(AudioAttributes.USAGE_NOTIFICATION, crowd.getAudioAttributes().getUsage());
    }

    @Test
    public void legacyChannelsAreReplacedOnceAndALaterMuteIsKept() {
        Context context = RuntimeEnvironment.getApplication();
        shadowOf((Application) context).grantPermissions(android.Manifest.permission.POST_NOTIFICATIONS);
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        context.getSharedPreferences(WatchScheduler.PREFS, Context.MODE_PRIVATE).edit().putBoolean("goal_channels_v4", false).commit();
        manager.deleteNotificationChannel(AlertPoster.GOAL_CROWD);
        NotificationChannel legacy = new NotificationChannel("betspapa.goal.crowd", "old", NotificationManager.IMPORTANCE_LOW);
        legacy.setSound(Uri.parse("android.resource://" + context.getPackageName() + "/213123"), null);
        manager.createNotificationChannel(legacy);

        AlertPoster.ensure(context);

        assertEquals(null, manager.getNotificationChannel("betspapa.goal.crowd"));
        assertEquals(null, manager.getNotificationChannel(AlertPoster.ALERTS));
        NotificationChannel crowd = manager.getNotificationChannel(AlertPoster.GOAL_CROWD);
        assertEquals(NotificationManager.IMPORTANCE_HIGH, crowd.getImportance());
        assertEquals("android.resource://" + context.getPackageName() + "/raw/cheer_crowd", crowd.getSound().toString());

        manager.deleteNotificationChannel(AlertPoster.GOAL_CROWD);
        NotificationChannel muted = new NotificationChannel(AlertPoster.GOAL_CROWD, "Goal · Crowd", NotificationManager.IMPORTANCE_LOW);
        muted.setSound(null, null);
        manager.createNotificationChannel(muted);
        AlertPoster.ensure(context);
        assertEquals(NotificationManager.IMPORTANCE_LOW, manager.getNotificationChannel(AlertPoster.GOAL_CROWD).getImportance());
    }
}

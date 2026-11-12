package com.betspapa.scores.watch;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.Activity;
import android.app.Application;
import android.app.Notification;
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

        Notification watching = AlertPoster.watching(context, false);
        assertEquals("Watching live scores", watching.extras.getCharSequence(Notification.EXTRA_TITLE).toString());
        assertTrue(watching.extras.getCharSequence(Notification.EXTRA_TEXT).toString().contains("Betspapa"));
    }
}

package com.betspapa.scores.watch;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Notification;
import android.content.Context;
import android.content.Intent;
import android.service.notification.StatusBarNotification;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.UiDevice;
import com.betspapa.scores.MainActivity;
import com.betspapa.watch.WatchMatch;
import com.betspapa.watch.WatchState;
import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import okhttp3.mockwebserver.Dispatcher;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Runs on a device or emulator. The live feed is a local server in this process only.
 * Release builds are not debuggable and ignore that redirect, and they ship no sample matches.
 */
@RunWith(AndroidJUnit4.class)
public class BackgroundAlertQcTest {
    private final MockWebServer server = new MockWebServer();
    private final AtomicReference<String> score = new AtomicReference<String>("0:0");

    @Before
    public void grantNotifications() throws Exception {
        UiDevice device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        device.executeShellCommand("pm grant com.betspapa.scores android.permission.POST_NOTIFICATIONS");
    }

    @After
    public void cleanup() throws Exception {
        FeedClient.overrideFeeds(null, null);
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        new File(target.getFilesDir(), FeedClient.OVERRIDE_FILE).delete();
        server.shutdown();
    }

    @Test
    public void goalArrivesAfterBackgroundAndSwipe() throws Exception {
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        UiDevice device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        device.wakeUp();
        server.setDispatcher(new Dispatcher() {
            @Override
            public MockResponse dispatch(RecordedRequest request) {
                String body = "{\"data\":[{\"name\":\"Ghana Premier League\",\"events\":[{\"eventId\":\"sr:match:qc\",\"homeTeamName\":\"Hearts\",\"awayTeamName\":\"Kotoko\",\"estimateStartTime\":" + System.currentTimeMillis() + ",\"status\":1,\"matchStatus\":\"H1\",\"playedSeconds\":\"18:00\",\"setScore\":\"" + score.get() + "\"}]}]}";
                return new MockResponse().setResponseCode(200).setBody(body);
            }
        });
        server.start();
        String live = server.url("/live").toString();
        String fixtures = server.url("/fixtures").toString();
        FeedClient.overrideFeeds(fixtures, live);
        writeOverride(target, fixtures, live);
        saveLive(target, 0, 0);

        MainActivity activity = launch();
        waitForWeb(activity);
        js(activity, "(function(){localStorage.setItem('betspapa.follows.v1', JSON.stringify({matches:['sr:match:qc'],teams:[]})); localStorage.setItem('betspapa.settings.v1', JSON.stringify({browser:true,kickoff:true,goal:true,red:true,ht:true,ft:true,var:true,goalSound:'crowd',goalVolume:60})); return true;})()");
        js(activity, "window.location.reload()");
        waitForWeb(activity);
        Notification watching = null;
        long deadline = System.currentTimeMillis() + 25000L;
        while (watching == null && System.currentTimeMillis() < deadline) {
            saveLive(target, 0, 0);
            target.startForegroundService(new Intent(target, ScoreWatchService.class));
            Thread.sleep(1200);
            watching = find(target, "Betspapa is watching");
        }
        assertNotNull("foreground service notification missing: " + dump(target), watching);
        assertEquals(AlertPoster.WATCH, watching.getChannelId());
        device.openNotification();
        Thread.sleep(1200);
        shot(device, target, "fgs-while-live");
        device.pressBack();

        device.pressHome();
        Thread.sleep(1500);
        score.set("1:0");
        Intent poll = new Intent(target, ScoreWatchService.class);
        poll.setAction(ScoreWatchService.ACTION_POLL);
        target.startService(poll);
        Notification goal = waitForText(target, "Goal · Hearts", 35000);
        assertNotNull("goal notification missing after backgrounding", goal);
        assertEquals(AlertPoster.GOAL_CROWD, goal.getChannelId());
        assertTrue(String.valueOf(goal.extras.getCharSequence(Notification.EXTRA_TEXT)).contains("Kotoko"));
        device.openNotification();
        Thread.sleep(1200);
        shot(device, target, "goal-after-background");
        device.pressBack();

        device.pressRecentApps();
        Thread.sleep(1500);
        int width = device.getDisplayWidth();
        int height = device.getDisplayHeight();
        device.swipe(width / 2, (int) (height * 0.55), width / 2, 80, 50);
        Thread.sleep(800);
        device.swipe(width / 2, (int) (height * 0.5), width / 2, 40, 40);
        Thread.sleep(1500);
        shot(device, target, "after-swipe-recents");
        device.pressHome();
        device.openNotification();
        Thread.sleep(1000);
        shot(device, target, "goal-after-swipe");
        String services = device.executeShellCommand("dumpsys activity services com.betspapa.scores");
        if (!services.contains("ScoreWatchService")) {
            Thread.sleep(20000);
            target.startService(poll);
            Thread.sleep(3000);
            services = device.executeShellCommand("dumpsys activity services com.betspapa.scores");
        }
        assertTrue(services, services.contains("ScoreWatchService"));
        assertNotNull(waitForText(target, "Goal · Hearts", 5000));
        assertNotNull(activity);
    }

    @Test
    public void settingsStatusAndClosedAppTestAlert() throws Exception {
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        UiDevice device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        device.wakeUp();
        MainActivity activity = launch();
        waitForWeb(activity);
        js(activity, "window.location.assign('/settings')");
        assertTrue(waitForPage(activity, "Notification permission", 20000));
        assertTrue(waitForPage(activity, "Battery optimization", 8000));
        assertTrue("notification permission did not show as allowed", waitForJs(activity, "(function(){var text=document.body?document.body.innerText:''; return text.indexOf('Notification permission')>=0 && text.indexOf('Not allowed')<0 && text.indexOf('Allowed')>=0;})()", 15000));
        assertTrue(waitForPage(activity, "Optimized", 8000));
        assertTrue(waitForPage(activity, "Allow background activity", 8000));
        assertTrue(waitForPage(activity, "Send test background notification", 8000));
        js(activity, "(function(){var node=[].slice.call(document.querySelectorAll('span')).find(function(el){return el.textContent==='Notification permission';}); if(node) node.scrollIntoView({block:'center'}); return true;})()");
        Thread.sleep(800);
        shot(device, target, "settings-notifications");
        assertTrue(js(activity, "(function(){var button=[].slice.call(document.querySelectorAll('button')).find(function(el){return el.textContent.indexOf('Send test background notification')>=0;}); if(!button) return false; button.click(); return true;})()"));
        assertTrue(waitForPage(activity, "about 10 seconds", 8000));
        device.pressHome();
        Thread.sleep(12000);
        device.openNotification();
        Thread.sleep(1200);
        shot(device, target, "test-notification-closed");
        Notification test = waitForText(target, "Betspapa test", 8000);
        assertNotNull("test notification missing after the app was closed", test);
        assertEquals(AlertPoster.GOAL_CROWD, test.getChannelId());
    }

    private static MainActivity launch() {
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Intent intent = new Intent(target, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        return (MainActivity) InstrumentationRegistry.getInstrumentation().startActivitySync(intent);
    }

    private static void saveLive(Context target, int home, int away) throws Exception {
        WatchState state = new WatchState();
        state.browser = true;
        state.goalSound = "crowd";
        state.matchIds.add("sr:match:qc");
        state.seen.add("sr:match:qc:kickoff");
        state.fixturesAt = System.currentTimeMillis();
        WatchMatch match = new WatchMatch();
        match.id = "sr:match:qc";
        match.home = "Hearts";
        match.away = "Kotoko";
        match.homeId = "hearts";
        match.awayId = "kotoko";
        match.kickoffMs = System.currentTimeMillis() - 5 * 60_000L;
        match.status = "live";
        match.minute = 18;
        match.homeScore = home;
        match.awayScore = away;
        match.seenHome = home;
        match.seenAway = away;
        state.matches.add(match);
        state.save(WatchFiles.file(target));
    }

    private static void writeOverride(Context target, String fixtures, String live) throws Exception {
        File file = new File(target.getFilesDir(), FeedClient.OVERRIDE_FILE);
        FileOutputStream output = new FileOutputStream(file);
        output.write(("{\"fixtures\":\"" + fixtures + "\",\"live\":\"" + live + "\"}").getBytes("UTF-8"));
        output.close();
    }

    private static Notification waitForText(Context target, String text, long timeoutMs) throws InterruptedException {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            Notification found = find(target, text);
            if (found != null) return found;
            Thread.sleep(400);
        }
        return find(target, text);
    }

    private static Notification find(Context target, String text) {
        android.app.NotificationManager manager = (android.app.NotificationManager) target.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return null;
        StatusBarNotification[] active = manager.getActiveNotifications();
        for (StatusBarNotification item : active) {
            Notification note = item.getNotification();
            String title = String.valueOf(note.extras.getCharSequence(Notification.EXTRA_TITLE));
            String body = String.valueOf(note.extras.getCharSequence(Notification.EXTRA_TEXT));
            if (title.contains(text) || body.contains(text)) return note;
        }
        return null;
    }

    private static void waitForWeb(MainActivity activity) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 20000L;
        while (System.currentTimeMillis() < deadline) {
            if (js(activity, "(function(){return document.body && document.body.innerText.length > 40;})()")) return;
            Thread.sleep(400);
        }
    }

    private static boolean waitForPage(MainActivity activity, String text, long timeoutMs) throws InterruptedException {
        String needle = text.replace("\\", "\\\\").replace("'", "\\'");
        return waitForJs(activity, "(function(){return document.body && document.body.innerText.indexOf('" + needle + "')>=0;})()", timeoutMs);
    }

    private static boolean waitForJs(MainActivity activity, String script, long timeoutMs) throws InterruptedException {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            if (js(activity, script)) return true;
            Thread.sleep(400);
        }
        return false;
    }

    private static boolean js(MainActivity activity, String script) {
        AtomicBoolean value = new AtomicBoolean(false);
        AtomicBoolean done = new AtomicBoolean(false);
        InstrumentationRegistry.getInstrumentation().runOnMainSync(new Runnable() {
            @Override
            public void run() {
                WebView web = activity.getBridge() == null ? null : activity.getBridge().getWebView();
                if (web == null) {
                    done.set(true);
                    return;
                }
                web.evaluateJavascript(script, result -> {
                    value.set("true".equals(result));
                    done.set(true);
                });
            }
        });
        long deadline = System.currentTimeMillis() + 4000L;
        while (!done.get() && System.currentTimeMillis() < deadline) {
            try {
                Thread.sleep(50);
            } catch (InterruptedException error) {
                return false;
            }
        }
        return value.get();
    }

    private static String dump(Context target) {
        android.app.NotificationManager manager = (android.app.NotificationManager) target.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return "";
        StringBuilder builder = new StringBuilder();
        for (StatusBarNotification item : manager.getActiveNotifications()) {
            Notification note = item.getNotification();
            builder.append(note.extras.getCharSequence(Notification.EXTRA_TITLE)).append(" / ").append(note.getChannelId()).append("; ");
        }
        return builder.toString();
    }

    private static void shot(UiDevice device, Context target, String name) throws Exception {
        device.executeShellCommand("screencap -p /data/local/tmp/betspapa-" + name + ".png");
    }
}

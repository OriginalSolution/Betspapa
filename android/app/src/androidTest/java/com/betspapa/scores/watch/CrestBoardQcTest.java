package com.betspapa.scores.watch;

import static org.junit.Assert.assertTrue;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.UiObject2;
import com.betspapa.scores.MainActivity;
import com.betspapa.watch.WatchFiles;
import com.betspapa.watch.WatchMatch;
import com.betspapa.watch.WatchNote;
import com.betspapa.watch.WatchState;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Screenshots of the real board and a live card using the bundled crest store. */
@RunWith(AndroidJUnit4.class)
public class CrestBoardQcTest {
    @Test
    public void boardAndNotificationShowCrests() throws Exception {
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        UiDevice device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        device.wakeUp();
        device.executeShellCommand("wm dismiss-keyguard");
        device.executeShellCommand("input keyevent 82");
        device.executeShellCommand("settings put system screen_off_timeout 1800000");
        device.executeShellCommand("pm grant com.betspapa.scores android.permission.POST_NOTIFICATIONS");
        device.executeShellCommand("cmd uimode night yes");
        target.getSharedPreferences(WatchScheduler.PREFS, Context.MODE_PRIVATE)
            .edit()
            .putInt(WatchScheduler.SETUP_VERSION, 1)
            .putBoolean(WatchScheduler.SETUP_FINISHED, true)
            .commit();

        Intent intent = new Intent(target, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        target.startActivity(intent);
        MainActivity activity = waitForActivity();
        assertTrue(activity != null);
        Thread.sleep(1200);
        js(activity, "(function(){localStorage.setItem('betspapa.alertSetup.v1', JSON.stringify({version:1,finished:true})); return true;})()");
        js(activity, "window.location.assign('/')");
        assertTrue(waitFor(activity, "(function(){return document.querySelectorAll('img.crest').length>=4;})()", 50000));
        Thread.sleep(800);
        shot(device, "today-board");

        js(activity, "(function(){var node=[].slice.call(document.querySelectorAll('h2,h3,button,strong')).find(function(el){return /women|u21|copa del rey|serie b/i.test(el.textContent||'');}); if(node){node.scrollIntoView({block:'start'}); return true;} window.scrollTo(0, 900); return true;})()");
        Thread.sleep(700);
        shot(device, "today-board-leagues");

        assertTrue(js(activity, "(function(){var link=document.querySelector('a.match-main'); if(!link) return false; link.click(); return true;})()"));
        assertTrue(waitFor(activity, "(function(){return location.pathname.indexOf('/match/')===0 && document.querySelectorAll('img.crest').length>=2;})()", 20000));
        Thread.sleep(600);
        shot(device, "match-details");

        js(activity, "window.location.assign('/')");
        assertTrue(waitFor(activity, "(function(){return document.querySelector('button[aria-label=\"Next day\"]');})()", 20000));
        js(activity, "(function(){var button=document.querySelector('button[aria-label=\"Next day\"]'); button.click(); return true;})()");
        assertTrue(waitFor(activity, "(function(){return document.querySelectorAll('img.crest').length>=4;})()", 30000));
        Thread.sleep(600);
        shot(device, "tomorrow-board");

        device.pressHome();
        Thread.sleep(400);
        NotificationManager manager = (NotificationManager) target.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.cancelAll();
        WatchState state = new WatchState();
        state.browser = true;
        state.notificationStyle = "dark";
        state.goalSound = "crowd";
        state.matches.add(nations());
        state.save(WatchFiles.file(target));
        WatchNote note = new WatchNote("qc-nations:goal:home:1", "qc-nations", "goal", "Goal · England", "Kane score · England 1–0 Croatia");
        note.minute = 23;
        note.player = "Kane";
        AlertPoster.post(target, note, "crowd");
        Thread.sleep(800);
        device.openNotification();
        Thread.sleep(1200);
        expand(device);
        Thread.sleep(600);
        shot(device, "notification-live");
        device.executeShellCommand("cmd statusbar collapse");
    }

    private static WatchMatch nations() {
        WatchMatch match = new WatchMatch();
        match.id = "qc-nations";
        match.home = "England";
        match.away = "Croatia";
        match.homeFull = "England";
        match.awayFull = "Croatia";
        match.homeAbbr = "ENG";
        match.awayAbbr = "CRO";
        match.homeColor = "#ffffff";
        match.awayColor = "#ff0000";
        match.homeCrest = "/crests/img/917cf8f1c90652aa.png";
        match.awayCrest = "/crests/img/806f15961ab1c1c9.png";
        match.competition = "UEFA Nations League";
        match.status = "live";
        match.minute = 23;
        match.homeScore = 1;
        match.awayScore = 0;
        match.addMarker("goal", 23, "ENG");
        return match;
    }

    private static boolean waitFor(MainActivity activity, String script, long timeoutMs) throws InterruptedException {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            if (js(activity, script)) return true;
            Thread.sleep(400);
        }
        return false;
    }

    private static void expand(UiDevice device) throws Exception {
        for (int pass = 0; pass < 4; pass++) {
            List<UiObject2> buttons = device.findObjects(By.res("android:id/expand_button"));
            if (buttons.isEmpty()) buttons = device.findObjects(By.descContains("Expand"));
            if (buttons.isEmpty()) break;
            for (UiObject2 button : buttons) {
                try {
                    button.click();
                    Thread.sleep(250);
                } catch (Exception ignored) {
                    /* the shade rebuilds the row */
                }
            }
        }
    }

    private static void shot(UiDevice device, String name) throws Exception {
        device.executeShellCommand("mkdir -p /sdcard/Download/betspapa-qc");
        device.executeShellCommand("screencap -p /sdcard/Download/betspapa-qc/" + name + ".png");
    }

    private static MainActivity waitForActivity() throws InterruptedException {
        long deadline = System.currentTimeMillis() + 20000L;
        while (System.currentTimeMillis() < deadline) {
            AtomicReference<MainActivity> ref = new AtomicReference<MainActivity>();
            InstrumentationRegistry.getInstrumentation().runOnMainSync(new Runnable() {
                @Override
                public void run() {
                    for (android.app.Activity activity : ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED)) {
                        if (activity instanceof MainActivity) ref.set((MainActivity) activity);
                    }
                }
            });
            if (ref.get() != null) return ref.get();
            Thread.sleep(200);
        }
        return null;
    }

    private static boolean js(MainActivity activity, final String script) {
        final AtomicBoolean value = new AtomicBoolean(false);
        final AtomicBoolean done = new AtomicBoolean(false);
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
                Thread.sleep(40);
            } catch (InterruptedException error) {
                return false;
            }
        }
        return value.get();
    }
}

package com.betspapa.scores.watch;

import static org.junit.Assert.assertTrue;

import android.app.NotificationManager;
import android.service.notification.StatusBarNotification;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.UiObject2;
import androidx.test.uiautomator.Until;
import java.util.List;
import com.betspapa.scores.MainActivity;
import com.betspapa.watch.WatchMatch;
import com.betspapa.watch.WatchNote;
import com.betspapa.watch.WatchState;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Posts the real custom cards on an Android 14 emulator and screenshots the shade.
 * The fixtures exist only in this test. The release app does not ship them.
 */
@RunWith(AndroidJUnit4.class)
public class NotificationShadeQcTest {
    @Test
    public void shadeMatchesTheApprovedCards() throws Exception {
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        UiDevice device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        device.wakeUp();
        device.executeShellCommand("wm dismiss-keyguard");
        device.executeShellCommand("input keyevent 82");
        device.executeShellCommand("settings put system screen_off_timeout 1800000");
        device.executeShellCommand("pm grant com.betspapa.scores android.permission.POST_NOTIFICATIONS");
        NotificationManager manager = (NotificationManager) target.getSystemService(Context.NOTIFICATION_SERVICE);

        night(device, target, true);
        manager.cancelAll();
        postBoard(target, "auto", true);
        device.pressHome();
        Thread.sleep(600);
        device.openNotification();
        Thread.sleep(1200);
        shot(device, "shade-dark-auto-collapsed");
        expand(device, 8);
        Thread.sleep(700);
        shot(device, "shade-dark-auto-expanded");
        device.executeShellCommand("cmd statusbar collapse");
        Thread.sleep(400);

        device.pressHome();
        Thread.sleep(400);
        manager.cancelAll();
        WatchNote headsUp = goalNote(false);
        AlertPoster.post(target, headsUp, "crowd");
        Thread.sleep(1200);
        shot(device, "goal-headsup-dark");
        device.executeShellCommand("cmd statusbar collapse");

        manager.cancelAll();
        save(target, "auto", true);
        WatchNote review = varNote();
        AlertPoster.post(target, review, "crowd");
        device.openNotification();
        Thread.sleep(900);
        expand(device, 2);
        Thread.sleep(500);
        shot(device, "goal-var-chip");
        WatchNote cleared = goalNote(false);
        AlertPoster.post(target, cleared, "crowd");
        Thread.sleep(800);
        shot(device, "goal-var-cleared");

        UiObject2 copy = device.wait(Until.findObject(By.text("Copy code")), 4000);
        if (copy == null) {
            device.openNotification();
            Thread.sleep(800);
            expand(device, 4);
            copy = device.wait(Until.findObject(By.text("Copy code")), 4000);
        }
        if (copy != null) {
            copy.click();
            Thread.sleep(600);
            device.executeShellCommand("cmd statusbar collapse");
            Thread.sleep(700);
            shot(device, "copy-code-toast");
            device.openNotification();
            Thread.sleep(500);
        } else {
            Intent copyIntent = new Intent(target, NotificationActionReceiver.class);
            copyIntent.setAction(NotificationActionReceiver.ACTION_COPY);
            copyIntent.putExtra(NotificationActionReceiver.EXTRA_CODE, "N7KQ2X");
            target.sendBroadcast(copyIntent);
            Thread.sleep(700);
            shot(device, "copy-code-toast");
        }
        device.executeShellCommand("cmd statusbar collapse");

        night(device, target, false);
        manager.cancelAll();
        postBoard(target, "auto", false);
        device.pressHome();
        Thread.sleep(500);
        device.openNotification();
        Thread.sleep(1000);
        shot(device, "shade-light-auto-collapsed");
        expand(device, 8);
        Thread.sleep(700);
        shot(device, "shade-light-auto-expanded");
        device.executeShellCommand("cmd statusbar collapse");

        night(device, target, false);
        manager.cancelAll();
        postBoard(target, "dark", true);
        device.openNotification();
        Thread.sleep(900);
        expand(device, 8);
        Thread.sleep(600);
        shot(device, "shade-light-system-forced-dark");
        device.executeShellCommand("cmd statusbar collapse");

        night(device, target, true);
        manager.cancelAll();
        postBoard(target, "light", false);
        device.openNotification();
        Thread.sleep(900);
        expand(device, 8);
        Thread.sleep(600);
        shot(device, "shade-dark-system-forced-light");
        device.executeShellCommand("cmd statusbar collapse");

        shotSettings(device, target);
        shotPapa(device, target);
        String listing = device.executeShellCommand("ls /sdcard/Download/betspapa-qc");
        int shots = 0;
        for (String line : listing.split("\n")) if (line.endsWith(".png")) shots++;
        assertTrue("screenshots missing: " + listing, shots >= 8);
    }

    private static void postBoard(Context context, String style, boolean darkContent) throws Exception {
        save(context, style, darkContent);
        AlertPoster.postLive(context, hearts(), false);
        WatchNote review = goalNote(true);
        AlertPoster.post(context, review, "crowd");
        AlertPoster.post(context, trend(), "crowd");
        AlertPoster.postLive(context, collapsed(), true);
    }

    private static void save(Context context, String style, boolean ignored) throws Exception {
        WatchState state = new WatchState();
        state.browser = true;
        state.notificationStyle = style;
        state.goalSound = "crowd";
        state.matches.add(hearts());
        state.matches.add(arsenal());
        state.matches.add(collapsed());
        state.save(WatchFiles.file(context));
    }

    private static WatchMatch hearts() {
        WatchMatch match = new WatchMatch();
        match.id = "qc-hearts";
        match.home = "Hearts";
        match.away = "Kotoko";
        match.homeFull = "Hearts of Oak";
        match.awayFull = "Asante Kotoko";
        match.homeAbbr = "HO";
        match.awayAbbr = "AK";
        match.homeColor = "#f0c94a";
        match.awayColor = "#e11d2e";
        match.competition = "Ghana Premier League";
        match.status = "live";
        match.minute = 67;
        match.homeScore = 1;
        match.awayScore = 0;
        match.addMarker("goal", 14, "HO");
        match.addMarker("yellow", 27, "AK");
        match.addMarker("goal", 41, "AK");
        match.addMarker("goal", 67, "HO");
        return match;
    }

    private static WatchMatch arsenal() {
        WatchMatch match = new WatchMatch();
        match.id = "qc-arsenal";
        match.home = "Arsenal";
        match.away = "Chelsea";
        match.homeFull = "Arsenal";
        match.awayFull = "Chelsea";
        match.homeAbbr = "ARS";
        match.awayAbbr = "CHE";
        match.homeColor = "#e11d2e";
        match.awayColor = "#034694";
        match.homeCrest = "https://upload.wikimedia.org/wikipedia/en/thumb/5/53/Arsenal_FC.svg/250px-Arsenal_FC.svg.png";
        match.awayCrest = "https://upload.wikimedia.org/wikipedia/en/thumb/c/cc/Chelsea_FC.svg/250px-Chelsea_FC.svg.png";
        match.competition = "Premier League";
        match.status = "live";
        match.minute = 54;
        match.homeScore = 2;
        match.awayScore = 1;
        match.addMarker("goal", 12, "ARS");
        match.addMarker("goal", 31, "CHE");
        match.addMarker("goal", 54, "ARS");
        match.addMarker("var", 54, "ARS");
        return match;
    }

    private static WatchMatch collapsed() {
        WatchMatch match = new WatchMatch();
        match.id = "qc-medeama";
        match.home = "Medeama";
        match.away = "Dreams";
        match.homeFull = "Medeama";
        match.awayFull = "Dreams";
        match.homeAbbr = "MED";
        match.awayAbbr = "DRM";
        match.homeColor = "#e11d2e";
        match.awayColor = "#1d4e89";
        match.competition = "Ghana Premier League";
        match.status = "live";
        match.minute = 81;
        match.homeScore = 1;
        match.awayScore = 1;
        return match;
    }

    private static WatchNote goalNote(boolean review) {
        WatchNote note = new WatchNote("qc-arsenal:goal:home:2", "qc-arsenal", "goal", "Goal · Arsenal", "Saka score · Arsenal 2–1 Chelsea");
        note.minute = 54;
        note.player = "Saka";
        note.varCheck = review;
        return note;
    }

    private static WatchNote varNote() {
        WatchNote note = new WatchNote("qc-arsenal:var:54:Saka", "qc-arsenal", "var", "VAR", "Saka 54′ · Arsenal goal under review");
        note.minute = 54;
        note.player = "Saka";
        note.varCheck = true;
        return note;
    }

    private static WatchNote trend() {
        WatchNote note = new WatchNote("trend:qc-arsenal:over25:hit", "qc-arsenal", "win", "Trend hit · Over 2.5 goals", "Arsenal vs Chelsea · Over 2.5 goals");
        note.marketLabel = "Over 2.5 goals";
        note.fixture = "ARS vs CHE";
        note.oddsText = "1.72";
        note.bookId = "sportybet";
        note.bookCode = "N7KQ2X";
        return note;
    }

    private static void night(UiDevice device, Context context, boolean on) throws Exception {
        device.executeShellCommand("cmd uimode night " + (on ? "yes" : "no"));
        Thread.sleep(400);
        Configuration config = new Configuration(context.getResources().getConfiguration());
        config.uiMode = (config.uiMode & ~Configuration.UI_MODE_NIGHT_MASK) | (on ? Configuration.UI_MODE_NIGHT_YES : Configuration.UI_MODE_NIGHT_NO);
        context.getResources().updateConfiguration(config, context.getResources().getDisplayMetrics());
    }

    private static void expand(UiDevice device, int times) throws Exception {
        for (int pass = 0; pass < times; pass++) {
            List<UiObject2> buttons = device.findObjects(By.res("android:id/expand_button"));
            if (buttons.isEmpty()) buttons = device.findObjects(By.descContains("Expand"));
            if (buttons.isEmpty()) break;
            boolean clicked = false;
            for (UiObject2 button : buttons) {
                try {
                    String desc = button.getContentDescription();
                    if (desc != null && desc.toLowerCase().contains("collapse")) continue;
                    button.click();
                    clicked = true;
                    Thread.sleep(250);
                } catch (Exception ignored) {
                    /* the shade rebuilds the row after a click */
                }
            }
            if (!clicked) break;
        }
    }

    private static void shot(UiDevice device, String name) throws Exception {
        device.executeShellCommand("mkdir -p /sdcard/Download/betspapa-qc");
        device.executeShellCommand("screencap -p /sdcard/Download/betspapa-qc/" + name + ".png");
    }

    private static void shotPapa(UiDevice device, Context target) throws Exception {
        MainActivity activity = waitForActivity();
        if (activity != null) {
            js(activity, "(function(){var saved={}; try{saved=JSON.parse(localStorage.getItem('betspapa.settings.v1')||'{}');}catch(e){} saved.goalSound='papa'; saved.goalVolume=60; localStorage.setItem('betspapa.settings.v1', JSON.stringify(saved)); return true;})()");
            js(activity, "window.location.reload()");
            long deadline = System.currentTimeMillis() + 15000L;
            while (System.currentTimeMillis() < deadline) {
                if (js(activity, "(function(){var button=[].slice.call(document.querySelectorAll('button')).find(function(el){return (el.textContent||'').trim()==='Papa Shout';}); return !!(button && button.getAttribute('aria-checked')==='true');})()")) break;
                Thread.sleep(400);
            }
            js(activity, "(function(){var node=[].slice.call(document.querySelectorAll('strong')).find(function(el){return el.textContent==='Goal sound';}); if(node) node.scrollIntoView({block:'center'}); return true;})()");
            Thread.sleep(700);
            shot(device, "settings-papa-shout");
            js(activity, "(function(){var button=[].slice.call(document.querySelectorAll('button')).find(function(el){return (el.textContent||'').trim()==='Preview';}); if(!button) return false; button.click(); return true;})()");
            Thread.sleep(500);
        }
        device.pressHome();
        Thread.sleep(500);
        NotificationManager manager = (NotificationManager) target.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.cancelAll();
        AlertPoster.post(target, goalNote(false), "papa");
        Thread.sleep(900);
        boolean onPapa = false;
        if (manager != null) {
            for (StatusBarNotification item : manager.getActiveNotifications()) {
                if (AlertPoster.GOAL_PAPA.equals(item.getNotification().getChannelId())) onPapa = true;
            }
        }
        device.openNotification();
        Thread.sleep(900);
        shot(device, "goal-papa-channel");
        device.executeShellCommand("cmd statusbar collapse");
        if (!onPapa) throw new AssertionError("goal was not posted on " + AlertPoster.GOAL_PAPA);
    }

    private static void shotSettings(UiDevice device, Context target) throws Exception {
        device.executeShellCommand("cmd statusbar collapse");
        NotificationManager manager = (NotificationManager) target.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.cancelAll();
        device.pressHome();
        Thread.sleep(400);
        target.getSharedPreferences(WatchScheduler.PREFS, Context.MODE_PRIVATE)
            .edit()
            .putInt(WatchScheduler.SETUP_VERSION, 1)
            .putBoolean(WatchScheduler.SETUP_FINISHED, true)
            .commit();
        Intent intent = new Intent(target, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        target.startActivity(intent);
        MainActivity activity = waitForActivity();
        if (activity == null) return;
        Thread.sleep(1500);
        js(activity, "(function(){localStorage.setItem('betspapa.alertSetup.v1', JSON.stringify({version:1,finished:true})); return true;})()");
        js(activity, "window.location.assign('/settings')");
        long deadline = System.currentTimeMillis() + 20000L;
        while (System.currentTimeMillis() < deadline) {
            if (js(activity, "(function(){return document.body && document.body.innerText.indexOf('Notification style')>=0;})()")) break;
            Thread.sleep(400);
        }
        js(activity, "(function(){var node=[].slice.call(document.querySelectorAll('strong')).find(function(el){return el.textContent==='Notification style';}); if(node) node.scrollIntoView({block:'center'}); return true;})()");
        Thread.sleep(800);
        shot(device, "settings-notification-style");
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

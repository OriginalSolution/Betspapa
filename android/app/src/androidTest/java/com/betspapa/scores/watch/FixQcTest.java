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
import androidx.test.uiautomator.Until;
import com.betspapa.scores.MainActivity;
import com.betspapa.watch.WatchMatch;
import com.betspapa.watch.WatchState;
import java.util.Collections;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Emulator proof for 0.3.4. The Ghana card is built by the score-change path.
 * It is not shipped in the release app.
 */
@RunWith(AndroidJUnit4.class)
public class FixQcTest {
    @Test
    public void proveTheFourFixes() throws Exception {
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        UiDevice device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        device.wakeUp();
        device.executeShellCommand("wm dismiss-keyguard");
        device.executeShellCommand("input keyevent 82");
        device.executeShellCommand("settings put system screen_off_timeout 1800000");
        device.executeShellCommand("pm grant com.betspapa.scores android.permission.POST_NOTIFICATIONS");
        NotificationManager manager = (NotificationManager) target.getSystemService(Context.NOTIFICATION_SERVICE);

        WatchState state = new WatchState();
        state.browser = true;
        state.notificationStyle = "dark";
        state.matchIds.add("sr:match:gha");
        WatchMatch before = ghana();
        before.status = "live";
        before.minute = 22;
        before.homeScore = 0;
        before.awayScore = 0;
        state.matches.add(before);
        WatchMatch scored = ghana();
        scored.status = "live";
        scored.minute = 23;
        scored.homeScore = 1;
        scored.awayScore = 0;
        state.overlayLive(Collections.singletonList(scored), System.currentTimeMillis());
        WatchMatch later = ghana();
        later.status = "live";
        later.minute = 57;
        later.homeScore = 1;
        later.awayScore = 0;
        later.competition = "Africa Cup of Nations Qualification";
        state.overlayLive(Collections.singletonList(later), System.currentTimeMillis());
        WatchMatch live = state.matches.get(0);
        assertTrue(live.markers.size() == 1);
        assertTrue(live.markers.get(0).minute == 23);
        state.save(WatchFiles.file(target));
        if (manager != null) manager.cancelAll();
        AlertPoster.postLive(target, live, false);
        device.pressHome();
        Thread.sleep(600);
        device.openNotification();
        Thread.sleep(1200);
        expand(device);
        Thread.sleep(700);
        shot(device, "a-live-card-goal-marker");
        device.executeShellCommand("cmd statusbar collapse");

        target.getSharedPreferences(WatchScheduler.PREFS, Context.MODE_PRIVATE)
            .edit()
            .putInt(WatchScheduler.SETUP_VERSION, 1)
            .putBoolean(WatchScheduler.SETUP_FINISHED, true)
            .commit();
        Intent launch = new Intent(target, MainActivity.class);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        target.startActivity(launch);
        MainActivity activity = waitForActivity();
        assertTrue(activity != null);
        Thread.sleep(1200);
        js(activity, "(function(){localStorage.setItem('betspapa.alertSetup.v1', JSON.stringify({version:1,finished:true})); return true;})()");
        String picked = waitForMatch(activity);
        String[] parts = picked.split("\\|");
        String openId = parts.length > 0 && parts[0].length() > 0 ? parts[0] : live.id;
        WatchMatch opened = ghana();
        opened.id = openId;
        if (parts.length > 2 && parts[1].length() > 0 && parts[2].length() > 0) {
            opened.home = parts[1];
            opened.away = parts[2];
            opened.homeFull = parts[1];
            opened.awayFull = parts[2];
            opened.homeAbbr = abbr(parts[1]);
            opened.awayAbbr = abbr(parts[2]);
            opened.competition = "";
        }
        opened.status = "live";
        opened.minute = 57;
        opened.homeScore = 1;
        opened.awayScore = 0;
        opened.setGoal("home", 1, 23, opened.abbrHome(), "", false);
        if (manager != null) manager.cancelAll();
        AlertPoster.postLive(target, opened, false);
        device.pressHome();
        Thread.sleep(500);
        device.openNotification();
        Thread.sleep(1000);
        expand(device);
        Thread.sleep(400);
        shot(device, "b-before-notification-tap");
        UiObject2 open = device.wait(Until.findObject(By.text("Open")), 4000);
        if (open != null) open.click();
        else device.click(device.getDisplayWidth() / 2, device.getDisplayHeight() / 3);
        Thread.sleep(2500);
        long deadline = System.currentTimeMillis() + 12000L;
        while (System.currentTimeMillis() < deadline) {
            if (js(activity, "(function(){return location.pathname.indexOf('/match/')===0;})()")) break;
            Thread.sleep(300);
        }
        shot(device, "b-after-notification-tap");
        assertTrue(js(activity, "(function(){return location.pathname.indexOf('/match/')===0;})()"));

        String seed = "(function(){var item={id:'qc-swipe',matchId:'" + openId + "',kind:'goal',title:'Goal · Ghana',body:'Ghana score · 23′',createdAt:Date.now(),read:true}; localStorage.setItem('betspapa.inbox.v1', JSON.stringify([item])); localStorage.setItem('betspapa.deletedAlerts.v1', JSON.stringify([])); return true;})()";
        js(activity, seed);
        js(activity, "window.location.assign('/inbox')");
        Thread.sleep(500);
        js(activity, "window.location.reload()");
        deadline = System.currentTimeMillis() + 15000L;
        while (System.currentTimeMillis() < deadline) {
            if (js(activity, "(function(){return document.body && document.body.innerText.indexOf('Goal · Ghana')>=0;})()")) break;
            Thread.sleep(400);
        }
        UiObject2 row = device.wait(Until.findObject(By.textContains("Goal")), 8000);
        assertTrue(row != null);
        js(activity, "(function(){var item=[].slice.call(document.querySelectorAll('.inbox-item')).find(function(el){return el.innerText.indexOf('Goal · Ghana')>=0;}); if(!item) return false; var front=item.closest('.inbox-front')||item.parentElement; front.style.transition='none'; front.style.transform='translateX(-120px)'; return true;})()");
        Thread.sleep(250);
        shot(device, "c-alert-swipe-delete");
        assertTrue(js(activity, "(function(){var item=[].slice.call(document.querySelectorAll('.inbox-item')).find(function(el){return el.innerText.indexOf('Goal · Ghana')>=0;}); if(!item) return false; var row=item.closest('.inbox-front')||item.parentElement; row.style.transform=''; var rect=row.getBoundingClientRect(); function fire(type,x){row.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:rect.top+24,pointerId:1,pointerType:'touch'}));} fire('pointerdown', rect.right-24); fire('pointermove', rect.left+16); fire('pointerup', rect.left+16); return true;})()"));
        Thread.sleep(600);
        UiObject2 undo = device.wait(Until.findObject(By.text("Undo")), 4000);
        assertTrue("undo missing", undo != null);
        shot(device, "c-alert-deleted");
        undo.click();
        Thread.sleep(700);
        shot(device, "c-alert-undo");
        assertTrue(js(activity, "(function(){return document.body.innerText.indexOf('Goal · Ghana')>=0;})()"));

        js(activity, "window.location.assign('/picks')");
        deadline = System.currentTimeMillis() + 20000L;
        while (System.currentTimeMillis() < deadline) {
            if (js(activity, "(function(){var splash=document.getElementById('boot-splash'); var gone=!splash || splash.classList.contains('is-gone'); return location.pathname==='/picks' && gone && document.querySelectorAll('.odds').length>0;})()")) break;
            Thread.sleep(400);
        }
        Thread.sleep(600);
        shot(device, "d-picks-odds-floor");
        js(activity, "window.location.assign('/trends')");
        deadline = System.currentTimeMillis() + 15000L;
        while (System.currentTimeMillis() < deadline) {
            if (js(activity, "(function(){var splash=document.getElementById('boot-splash'); var gone=!splash || splash.classList.contains('is-gone'); return location.pathname==='/trends' && gone && document.body.innerText.indexOf('Follow a trend')>=0;})()")) break;
            Thread.sleep(400);
        }
        Thread.sleep(600);
        shot(device, "d-trends-odds-floor");
        assertTrue(js(activity, "(function(){var nodes=[].slice.call(document.querySelectorAll('.odds')); return nodes.every(function(node){var n=parseFloat(node.textContent); return !isFinite(n) || n>=1.2;});})()"));
    }

    private static String waitForMatch(MainActivity activity) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 25000L;
        while (System.currentTimeMillis() < deadline) {
            String packed = jsText(activity, "(function(){var link=document.querySelector('a.match-main'); if(!link) return ''; var names=[].slice.call(link.querySelectorAll('.name')).map(function(node){return (node.childNodes[0]&&node.childNodes[0].textContent||'').trim();}); var href=link.getAttribute('href')||''; if(href.indexOf('/match/')!==0) return ''; return href.slice(7)+'|'+names.join('|');})()");
            if (packed != null && packed.contains("|")) return packed;
            Thread.sleep(500);
        }
        return "";
    }

    private static String abbr(String name) {
        String[] words = name.replaceAll("[^A-Za-z ]", "").trim().split("\\s+");
        if (words.length >= 2 && words[0].length() > 0 && words[1].length() > 0) {
            return ("" + words[0].charAt(0) + words[1].charAt(0)).toUpperCase(java.util.Locale.US);
        }
        String clean = name.replaceAll("[^A-Za-z]", "").toUpperCase(java.util.Locale.US);
        return clean.length() <= 3 ? clean : clean.substring(0, 3);
    }

    private static WatchMatch ghana() {
        WatchMatch match = new WatchMatch();
        match.id = "sr:match:gha";
        match.home = "Ghana";
        match.away = "Somalia";
        match.homeFull = "Ghana";
        match.awayFull = "Somalia";
        match.homeAbbr = "GHA";
        match.awayAbbr = "SOM";
        match.homeColor = "#e11d2e";
        match.awayColor = "#3d7eff";
        match.competition = "Africa Cup of Nations Qualification";
        match.status = "live";
        return match;
    }

    private static void expand(UiDevice device) throws InterruptedException {
        for (int pass = 0; pass < 6; pass++) {
            java.util.List<UiObject2> buttons = device.findObjects(By.res("android:id/expand_button"));
            if (buttons.isEmpty()) buttons = device.findObjects(By.descContains("Expand"));
            if (buttons.isEmpty()) break;
            for (UiObject2 button : buttons) {
                try {
                    String desc = button.getContentDescription();
                    if (desc != null && desc.toLowerCase().contains("collapse")) continue;
                    button.click();
                    Thread.sleep(200);
                } catch (RuntimeException ignored) {
                    /* the shade rebuilds after a click */
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

    private static boolean js(MainActivity activity, String script) {
        return "true".equals(jsText(activity, script));
    }

    private static String jsText(MainActivity activity, final String script) {
        final AtomicReference<String> value = new AtomicReference<String>("");
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
                    if (result == null || "null".equals(result)) value.set("");
                    else if (result.length() >= 2 && result.startsWith("\"") && result.endsWith("\"")) {
                        value.set(result.substring(1, result.length() - 1).replace("\\\"", "\""));
                    } else value.set(result);
                    done.set(true);
                });
            }
        });
        long deadline = System.currentTimeMillis() + 5000L;
        while (!done.get() && System.currentTimeMillis() < deadline) {
            try {
                Thread.sleep(40);
            } catch (InterruptedException error) {
                return "";
            }
        }
        return value.get();
    }
}

package com.betspapa.scores.watch;

import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.Intent;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;
import androidx.test.uiautomator.UiDevice;
import com.betspapa.scores.BuildConfig;
import com.betspapa.scores.MainActivity;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Live production check for the both-teams section. Debug only.
 * The app talks to api.betspapa.com. Screenshots land on the emulator sdcard.
 */
@RunWith(AndroidJUnit4.class)
public class AgreeQcTest {
    @Test
    public void agreedMarketsOnProduction() throws Exception {
        String name = InstrumentationRegistry.getArguments().getString("name", "qc");
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        UiDevice device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        device.wakeUp();
        device.executeShellCommand("wm dismiss-keyguard");
        device.executeShellCommand("input keyevent 82");
        String fontRaw = device.executeShellCommand("settings get system font_scale").trim();
        float fontScale = 1f;
        try {
            fontScale = Float.parseFloat(fontRaw);
        } catch (NumberFormatException ignored) {
            fontScale = target.getResources().getConfiguration().fontScale;
        }
        int textZoom = MainActivity.textZoomFor(fontScale);
        System.out.println("qc name=" + name + " fontScale=" + fontScale + " textZoom=" + textZoom + " play=" + BuildConfig.PLAY_STORE);
        if (name.endsWith("font")) {
            assertTrue("system font scale stayed at " + fontRaw, fontScale >= 1.25f);
        }
        target.getSharedPreferences(WatchScheduler.PREFS, Context.MODE_PRIVATE)
            .edit()
            .putInt(WatchScheduler.SETUP_VERSION, 3)
            .putBoolean(WatchScheduler.SETUP_FINISHED, true)
            .commit();

        Intent launch = new Intent(target, MainActivity.class);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        target.startActivity(launch);
        MainActivity activity = waitForActivity();
        assertTrue("main activity did not resume", activity != null);
        Thread.sleep(1500);
        js(activity, "(function(){localStorage.setItem('betspapa.alertSetup.v1', JSON.stringify({version:3,finished:true})); return true;})()");
        js(activity, "window.location.assign('/picks')");

        String picks = waitJs(activity, picksReady(BuildConfig.PLAY_STORE), 50000L);
        assertTrue("Picks did not show both-teams rows from production. " + snippet(activity), "ready".equals(picks));
        js(activity, "(function(){var node=document.querySelector('.agree-actions'); var scroller=document.querySelector('.main'); if(!node||!scroller) return false; var box=node.getBoundingClientRect(); var view=scroller.getBoundingClientRect(); scroller.scrollTop += box.bottom - view.bottom + 120; return true;})()");
        Thread.sleep(400);
        dismissAnr(device);
        shot(device, name + "-picks");

        js(activity, "(function(){var link=document.querySelector('.agree-link'); if(!link) return false; window.location.assign(link.getAttribute('href')); return true;})()");
        String last = waitJs(activity, lastReady(BuildConfig.PLAY_STORE), 40000L);
        assertTrue("Last 10 did not show the expanded markets. " + snippet(activity), "ready".equals(last));
        js(activity, "(function(){var table=document.querySelector('[aria-label=\"Last 10\"]'); var scroller=document.querySelector('.main'); if(!table||!scroller) return false; var box=table.getBoundingClientRect(); var view=scroller.getBoundingClientRect(); scroller.scrollTop += box.top - view.top; return true;})()");
        Thread.sleep(400);
        dismissAnr(device);
        shot(device, name + "-last10");
        for (int page = 2; page <= 5; page++) {
            String more = jsText(activity, "(function(){var scroller=document.querySelector('.main'); var table=document.querySelector('[aria-label=\"Last 10\"]'); if(!scroller||!table) return 'done'; var view=scroller.getBoundingClientRect(); var bottom=table.getBoundingClientRect().bottom; if(bottom<=view.bottom+2) return 'done'; scroller.scrollTop += Math.max(160, scroller.clientHeight*0.72); return 'more';})()");
            if (!"more".equals(more)) break;
            Thread.sleep(300);
            dismissAnr(device);
            shot(device, name + "-last10-" + page);
        }
    }

    private static String picksReady(boolean play) {
        String tier = play ? "/10" : "%";
        String load = play
            ? "if(buttons.indexOf('Load')>=0) return 'load';"
            : "if(buttons.indexOf('Load')<0) return 'load';";
        return "(function(){"
            + "var splash=document.getElementById('boot-splash');"
            + "if(splash && !splash.classList.contains('is-gone')) return 'splash';"
            + "if(location.pathname!=='/picks') return 'route';"
            + "var board=document.querySelector('.agree-board');"
            + "if(!board) return 'board';"
            + "var text=board.innerText||'';"
            + "if(/sportybet|football\\.com|msport|betika|betpawa/i.test(text)) return 'book';"
            + "if(text.indexOf('Both teams agree')<0) return 'title';"
            + "var buttons=[].slice.call(board.querySelectorAll('button')).map(function(node){return (node.textContent||'').trim();}).join(' ');"
            + "if(buttons.indexOf('Copy')<0 || buttons.indexOf('Alerts')<0) return 'buttons';"
            + load
            + "var tier=board.querySelector('.agree-tier');"
            + "if(!tier || tier.textContent.indexOf('" + tier + "')<0) return 'tier';"
            + "var rings=[].slice.call(document.querySelectorAll('.pick-tier small'));"
            + "if(!rings.length) return 'rings';"
            + "if(rings.some(function(node){return node.classList.contains('is-wait');})) return 'rings';"
            + "return 'ready';"
            + "})()";
    }

    private static String lastReady(boolean play) {
        String pill = play ? "/10" : "%";
        return "(function(){"
            + "var rows=document.querySelectorAll('.last10-row');"
            + "if(rows.length<15) return 'rows';"
            + "var text=[].slice.call(rows).map(function(row){return row.innerText;}).join(' ');"
            + "if(text.indexOf('Double chance')<0 || text.indexOf('Draw no bet')<0) return 'markets';"
            + "if(text.indexOf('1st half')<0 || text.indexOf('Scored in both halves')<0) return 'halves';"
            + "if(/sportybet|football\\.com|msport|betika|betpawa/i.test(text)) return 'book';"
            + "var pills=[].slice.call(document.querySelectorAll('.agree-pill')).map(function(node){return node.textContent;}).join(' ');"
            + "if(pills.indexOf('" + pill + "')<0) return 'pill';"
            + "return 'ready';"
            + "})()";
    }

    private static String waitJs(MainActivity activity, String script, long budget) throws InterruptedException {
        long deadline = System.currentTimeMillis() + budget;
        String last = "";
        while (System.currentTimeMillis() < deadline) {
            last = jsText(activity, script);
            if ("ready".equals(last)) return last;
            Thread.sleep(500);
        }
        return last;
    }

    private static String snippet(MainActivity activity) {
        String text = jsText(activity, "(function(){return (location.pathname||'')+' '+(document.body?document.body.innerText:'').slice(0,180);})()");
        return "last=" + text;
    }

    private static void dismissAnr(UiDevice device) {
        try {
            device.executeShellCommand("am force-stop com.google.android.apps.nexuslauncher");
        } catch (Exception ignored) {
            /* a missing launcher must not fail the shot */
        }
    }

    private static void shot(UiDevice device, String name) throws Exception {
        device.executeShellCommand("mkdir -p /sdcard/Download/betspapa-qc");
        device.executeShellCommand("screencap -p /sdcard/Download/betspapa-qc/" + name + ".png");
    }

    private static MainActivity waitForActivity() throws InterruptedException {
        long deadline = System.currentTimeMillis() + 25000L;
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
                android.webkit.WebView web = activity.getBridge() == null ? null : activity.getBridge().getWebView();
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
        long deadline = System.currentTimeMillis() + 8000L;
        while (!done.get() && System.currentTimeMillis() < deadline) {
            try {
                Thread.sleep(40);
            } catch (InterruptedException error) {
                return "";
            }
        }
        return value.get() == null ? "" : value.get();
    }
}

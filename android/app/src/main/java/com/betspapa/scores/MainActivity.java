package com.betspapa.scores;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.os.SystemClock;
import android.content.Intent;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.splashscreen.SplashScreenViewProvider;
import com.betspapa.scores.watch.AlertPoster;
import com.betspapa.scores.watch.PushBridge;
import com.betspapa.scores.watch.OpenMatch;
import com.betspapa.scores.watch.WatchPlugin;
import com.betspapa.scores.watch.WatchScheduler;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    private volatile boolean webReady;
    private long splashStarted;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        splashStarted = SystemClock.uptimeMillis();
        splashScreen.setKeepOnScreenCondition(() -> {
            long elapsed = SystemClock.uptimeMillis() - splashStarted;
            if (elapsed < 1100L) return true;
            if (pageReady()) return false;
            return elapsed < 4000L;
        });
        splashScreen.setOnExitAnimationListener(new SplashScreen.OnExitAnimationListener() {
            @Override
            public void onSplashScreenExit(SplashScreenViewProvider screen) {
                View view = screen.getView();
                view.animate()
                    .alpha(0f)
                    .setDuration(350L)
                    .setListener(new AnimatorListenerAdapter() {
                        @Override
                        public void onAnimationEnd(Animator animation) {
                            screen.remove();
                        }
                    })
                    .start();
            }
        });
        registerPlugin(WatchPlugin.class);
        registerPlugin(PlayBillingPlugin.class);
        registerPlugin(AdsPlugin.class);
        super.onCreate(savedInstanceState);
        paintBlack();
        AlertPoster.ensure(this);
        PushBridge.listen(this);
        deliverOpen(getIntent());
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setBackgroundColor(0xFF07080C);
            // Android scales WebView text by the system font size. Xiaomi and Samsung phones
            // often ship at 110-130%, which broke rows sized for 100%. Honour a small boost,
            // cap the rest so every screen still fits.
            WebSettings web = getBridge().getWebView().getSettings();
            web.setTextZoom(textZoomFor(getResources().getConfiguration().fontScale));
            getBridge().addWebViewListener(new WebViewListener() {
                @Override
                public void onPageLoaded(WebView webView) {
                    webReady = true;
                    deliverOpen(getIntent());
                }
            });
        }
    }

    /** WebView text zoom for a system font scale: follows it between 85% and 115%. */
    public static int textZoomFor(float fontScale) {
        if (Float.isNaN(fontScale) || fontScale <= 0f) return 100;
        float clamped = Math.max(0.85f, Math.min(1.15f, fontScale));
        return Math.round(clamped * 100f);
    }

    private boolean pageReady() {
        if (webReady) return true;
        if (getBridge() == null || getBridge().getWebView() == null) return false;
        return getBridge().getWebView().getProgress() >= 100;
    }

    private void paintBlack() {
        if (getWindow() == null) return;
        int theme = 0xFF07080C;
        getWindow().setBackgroundDrawable(new ColorDrawable(theme));
        View decor = getWindow().getDecorView();
        if (decor != null) decor.setBackgroundColor(theme);
        getWindow().setStatusBarColor(theme);
        getWindow().setNavigationBarColor(theme);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        deliverOpen(intent);
    }

    private void deliverOpen(Intent intent) {
        if (intent == null || getBridge() == null) return;
        String route = intent.getStringExtra(OpenMatch.EXTRA_ROUTE);
        String matchId = intent.getStringExtra(OpenMatch.EXTRA_MATCH);
        String trendId = intent.getStringExtra(OpenMatch.EXTRA_TREND);
        if ((matchId == null || matchId.isEmpty()) && (trendId == null || trendId.isEmpty())) return;
        if (route == null || route.isEmpty() || "home".equals(route)) return;
        PluginHandle handle = getBridge().getPlugin("Watch");
        if (handle == null || !(handle.getInstance() instanceof WatchPlugin)) return;
        ((WatchPlugin) handle.getInstance()).emitOpen(route, matchId, trendId);
        intent.removeExtra(OpenMatch.EXTRA_ROUTE);
        intent.removeExtra(OpenMatch.EXTRA_MATCH);
        intent.removeExtra(OpenMatch.EXTRA_TREND);
        setIntent(intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        WatchScheduler.setUiForeground(this, true);
    }

    @Override
    public void onPause() {
        super.onPause();
        WatchScheduler.setUiForeground(this, false);
    }
}

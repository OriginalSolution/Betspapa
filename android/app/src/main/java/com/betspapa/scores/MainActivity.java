package com.betspapa.scores;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.View;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.splashscreen.SplashScreenViewProvider;
import com.betspapa.scores.watch.AlertPoster;
import com.betspapa.scores.watch.WatchPlugin;
import com.betspapa.scores.watch.WatchScheduler;
import com.getcapacitor.BridgeActivity;
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
        super.onCreate(savedInstanceState);
        paintBlack();
        AlertPoster.ensure(this);
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setBackgroundColor(Color.BLACK);
            getBridge().addWebViewListener(new WebViewListener() {
                @Override
                public void onPageLoaded(WebView webView) {
                    webReady = true;
                }
            });
        }
    }

    private boolean pageReady() {
        if (webReady) return true;
        if (getBridge() == null || getBridge().getWebView() == null) return false;
        return getBridge().getWebView().getProgress() >= 100;
    }

    private void paintBlack() {
        if (getWindow() == null) return;
        getWindow().setBackgroundDrawable(new ColorDrawable(Color.BLACK));
        View decor = getWindow().getDecorView();
        if (decor != null) decor.setBackgroundColor(Color.BLACK);
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);
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

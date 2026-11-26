package com.betspapa.scores;

import android.app.Activity;
import android.view.View;
import android.widget.FrameLayout;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdSize;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;

/**
 * Google's test ad units only. A real AdMob app id and unit ids replace these later.
 * Nothing here loads until the web view asks, and it never opens an ad by itself.
 */
@CapacitorPlugin(name = "Ads")
public class AdsPlugin extends Plugin {
    static final String TEST_BANNER = "ca-app-pub-3940256099942544/6300978111";
    static final String TEST_REWARDED = "ca-app-pub-3940256099942544/5224354917";

    private AdView banner;
    private boolean ready;

    @PluginMethod
    public void placeBanner(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.resolve();
            return;
        }
        activity.runOnUiThread(() -> {
            ensure(activity);
            if (banner == null) {
                banner = new AdView(activity);
                banner.setAdUnitId(TEST_BANNER);
                banner.setAdSize(AdSize.BANNER);
                FrameLayout root = activity.findViewById(android.R.id.content);
                FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.WRAP_CONTENT,
                    FrameLayout.LayoutParams.WRAP_CONTENT
                );
                root.addView(banner, params);
                banner.loadAd(new AdRequest.Builder().build());
            }
            float density = activity.getResources().getDisplayMetrics().density;
            FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) banner.getLayoutParams();
            params.leftMargin = Math.round((float) call.getData().optDouble("x", 0) * density);
            params.topMargin = Math.round((float) call.getData().optDouble("y", 0) * density);
            banner.setLayoutParams(params);
            banner.setVisibility(View.VISIBLE);
            call.resolve();
        });
    }

    @PluginMethod
    public void hideBanner(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null || banner == null) {
            call.resolve();
            return;
        }
        activity.runOnUiThread(() -> {
            banner.setVisibility(View.GONE);
            call.resolve();
        });
    }

    @PluginMethod
    public void showRewarded(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("The video is only in the Android app.");
            return;
        }
        ensure(activity);
        RewardedAd.load(activity, TEST_REWARDED, new AdRequest.Builder().build(), new RewardedAdLoadCallback() {
            @Override
            public void onAdLoaded(RewardedAd ad) {
                boolean[] granted = { false };
                ad.setFullScreenContentCallback(new FullScreenContentCallback() {
                    @Override
                    public void onAdDismissedFullScreenContent() {
                        if (granted[0]) return;
                        JSObject out = new JSObject();
                        out.put("rewarded", false);
                        call.resolve(out);
                    }
                });
                ad.show(activity, reward -> {
                    granted[0] = true;
                    JSObject out = new JSObject();
                    out.put("rewarded", true);
                    call.resolve(out);
                });
            }

            @Override
            public void onAdFailedToLoad(LoadAdError error) {
                call.reject("The video did not load.");
            }
        });
    }

    private void ensure(Activity activity) {
        if (ready) return;
        ready = true;
        MobileAds.initialize(activity, status -> { });
    }
}

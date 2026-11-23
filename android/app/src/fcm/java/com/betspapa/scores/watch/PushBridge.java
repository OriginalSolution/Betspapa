package com.betspapa.scores.watch;

import android.content.Context;
import android.content.pm.PackageManager;
import android.util.Log;
import com.google.firebase.messaging.FirebaseMessaging;

/** Compiled only when google-services.json is present. */
public final class PushBridge {
    static final String PREFS = "betspapa.push";
    static final String TOKEN = "token";
    static final String ERROR = "error";
    private static final String TAG = "BetspapaPush";

    private PushBridge() {}

    public static boolean enabled() {
        return true;
    }

    /**
     * FCM needs Google Play services. Huawei phones sold without them (and some custom ROMs) never get a token,
     * so the server cannot push to them and only the on-phone watcher can alert.
     */
    public static boolean playServices(Context context) {
        try {
            context.getPackageManager().getPackageInfo("com.google.android.gms", 0);
            return true;
        } catch (PackageManager.NameNotFoundException missing) {
            return false;
        } catch (RuntimeException error) {
            return false;
        }
    }

    public static void listen(Context context) {
        Context app = context.getApplicationContext();
        if (!playServices(app)) {
            note(app, "no-play-services");
            return;
        }
        try {
            FirebaseMessaging.getInstance()
                .getToken()
                .addOnSuccessListener(token -> remember(app, token))
                .addOnFailureListener(error -> {
                    Log.w(TAG, "FCM token failed: " + error.getMessage());
                    note(app, String.valueOf(error.getMessage()));
                });
        } catch (RuntimeException error) {
            Log.w(TAG, "FCM unavailable: " + error.getMessage());
            note(app, String.valueOf(error.getMessage()));
        }
    }

    public static String currentToken(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(TOKEN, "");
    }

    public static String lastError(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(ERROR, "");
    }

    private static void note(Context context, String error) {
        String text = error == null ? "" : error.length() > 160 ? error.substring(0, 160) : error;
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(ERROR, text).apply();
    }

    static void remember(Context context, String token) {
        if (token == null || token.isEmpty()) return;
        String previous = currentToken(context);
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(TOKEN, token).putString(ERROR, "").apply();
        Log.i(TAG, "FCM token ready");
        // A rotated token is sent to the server now, not on the next app open.
        if (!previous.isEmpty() && !previous.equals(token)) DeviceRegistrar.onNewToken(context, token, previous);
    }
}

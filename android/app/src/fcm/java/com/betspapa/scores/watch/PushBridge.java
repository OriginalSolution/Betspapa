package com.betspapa.scores.watch;

import android.content.Context;
import com.google.firebase.messaging.FirebaseMessaging;

/** Compiled only when google-services.json is present. */
public final class PushBridge {
    static final String PREFS = "betspapa.push";
    static final String TOKEN = "token";

    private PushBridge() {}

    public static boolean enabled() {
        return true;
    }

    public static void listen(Context context) {
        Context app = context.getApplicationContext();
        FirebaseMessaging.getInstance().getToken().addOnSuccessListener(token -> remember(app, token));
    }

    public static String currentToken(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(TOKEN, "");
    }

    static void remember(Context context, String token) {
        if (token == null || token.isEmpty()) return;
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(TOKEN, token).apply();
    }
}

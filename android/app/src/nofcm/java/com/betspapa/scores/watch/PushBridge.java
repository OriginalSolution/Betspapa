package com.betspapa.scores.watch;

import android.content.Context;

/** Compiled when google-services.json is absent. The app still builds and the local poller stays the only alerter. */
public final class PushBridge {
    private PushBridge() {}

    public static boolean enabled() {
        return false;
    }

    public static void listen(Context context) {
    }

    public static String currentToken(Context context) {
        return "";
    }
}

package com.betspapa.scores.watch;

import android.content.Context;
import com.betspapa.watch.WatchState;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/**
 * One gate for every path that posts an alert card: the FCM service, the native
 * poller, and the WebView. Each used to check "already sent" on its own and mark it
 * only after posting, so a push and a poll landing together both played the cheer.
 * A claim is held in memory while the card is built and written to the sent list
 * once it is on the shade.
 */
public final class AlertGate {
    private static final Set<String> IN_FLIGHT = Collections.synchronizedSet(new HashSet<String>());

    private AlertGate() {}

    /** True when this caller owns `id` and may post it. */
    public static boolean claim(Context context, String id) {
        if (id == null || id.isEmpty()) return true;
        if (!IN_FLIGHT.add(id)) return false;
        boolean sent;
        synchronized (WatchState.FILE_LOCK) {
            sent = WatchState.load(WatchFiles.file(context)).sent.contains(id);
        }
        if (sent) {
            IN_FLIGHT.remove(id);
            return false;
        }
        return true;
    }

    /** Releases the claim. A posted card is marked sent so no other path repeats it. */
    public static void finish(Context context, String id, boolean posted) {
        if (id == null || id.isEmpty()) return;
        try {
            if (posted) markSent(context, id);
        } finally {
            IN_FLIGHT.remove(id);
        }
    }

    /** Marks an id handled without posting it, for a card that arrived too late to be news. */
    public static void markSent(Context context, String id) {
        synchronized (WatchState.FILE_LOCK) {
            WatchState state = WatchState.load(WatchFiles.file(context));
            if (state.sent.contains(id)) return;
            state.markSent(id);
            try {
                state.save(WatchFiles.file(context));
            } catch (Exception ignored) {
                /* the card is already on the shade */
            }
        }
    }

    /** Live-event cards older than this are recorded in the inbox but not posted. */
    public static long maxAgeMs(String kind) {
        if ("goal".equals(kind) || "var".equals(kind) || "red".equals(kind) || "penalty".equals(kind)) return 15L * 60_000L;
        if ("kickoff".equals(kind) || "ht".equals(kind)) return 15L * 60_000L;
        if ("ft".equals(kind)) return 30L * 60_000L;
        if ("win".equals(kind) || "bust".equals(kind) || "slip".equals(kind)) return 6L * 60L * 60_000L;
        return Long.MAX_VALUE;
    }

    public static boolean stale(String kind, long ageMs) {
        return ageMs > maxAgeMs(kind);
    }
}

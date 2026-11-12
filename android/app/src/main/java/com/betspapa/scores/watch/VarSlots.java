package com.betspapa.scores.watch;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.HashMap;
import java.util.Map;

/** The goal notification posted while VAR is open, so the decision can replace it. */
final class VarSlots {
    static final class Slot {
        final int id;
        final String player;
        final int minute;
        final String noteId;

        Slot(int id, String player, int minute, String noteId) {
            this.id = id;
            this.player = player == null ? "" : player;
            this.minute = minute;
            this.noteId = noteId == null ? "" : noteId;
        }
    }

    private static final Map<String, Slot> MEMORY = new HashMap<String, Slot>();

    private VarSlots() {}

    static void remember(Context context, String matchId, int id, String player, int minute, String noteId) {
        if (matchId == null || matchId.isEmpty()) return;
        Slot slot = new Slot(id, player, minute, noteId);
        synchronized (MEMORY) {
            MEMORY.put(matchId, slot);
        }
        prefs(context).edit()
            .putInt(key(matchId), id)
            .putString(playerKey(matchId), slot.player)
            .putInt(minuteKey(matchId), minute)
            .putString(noteKey(matchId), slot.noteId)
            .commit();
    }

    static Slot peek(Context context, String matchId) {
        if (matchId == null || matchId.isEmpty()) return null;
        synchronized (MEMORY) {
            Slot slot = MEMORY.get(matchId);
            if (slot != null) return slot;
        }
        SharedPreferences prefs = prefs(context);
        int id = prefs.getInt(key(matchId), 0);
        if (id == 0) return null;
        return new Slot(id, prefs.getString(playerKey(matchId), ""), prefs.getInt(minuteKey(matchId), 0), prefs.getString(noteKey(matchId), ""));
    }

    static Slot take(Context context, String matchId) {
        Slot slot = peek(context, matchId);
        if (slot == null) return null;
        synchronized (MEMORY) {
            MEMORY.remove(matchId);
        }
        prefs(context).edit().remove(key(matchId)).remove(playerKey(matchId)).remove(minuteKey(matchId)).remove(noteKey(matchId)).commit();
        return slot;
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(WatchScheduler.PREFS, Context.MODE_PRIVATE);
    }

    private static String key(String matchId) {
        return "var-slot-" + matchId;
    }

    private static String playerKey(String matchId) {
        return "var-player-" + matchId;
    }

    private static String minuteKey(String matchId) {
        return "var-minute-" + matchId;
    }

    private static String noteKey(String matchId) {
        return "var-note-" + matchId;
    }
}

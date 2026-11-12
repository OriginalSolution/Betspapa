package com.betspapa.scores.watch;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.betspapa.scores.MainActivity;
import com.betspapa.scores.R;
import com.betspapa.watch.AlertPlanner;
import com.betspapa.watch.WatchMatch;
import com.betspapa.watch.WatchNote;
import com.betspapa.watch.WatchState;
import java.util.HashSet;
import java.util.Set;

public final class AlertPoster {
    static final String ALERTS = "betspapa.alerts";
    static final String WATCH = "betspapa.watch";
    /** Ongoing score cards. Default importance, no sound, so they stay in the main shade. */
    static final String SCORECARD = "betspapa.scorecard";
    static final String GOAL_CROWD = "betspapa.goal.crowd";
    static final String GOAL_AFRO = "betspapa.goal.afro";
    static final String GOAL_CHANT = "betspapa.goal.chant";
    static final String GOAL_PAPA = "betspapa.goal.papa";
    static final String GOAL_OFF = "betspapa.goal.off";

    private AlertPoster() {}

    public static void ensure(Context context) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel alerts = new NotificationChannel(ALERTS, context.getString(R.string.alert_channel), NotificationManager.IMPORTANCE_HIGH);
        alerts.setDescription(context.getString(R.string.alert_channel_desc));
        NotificationChannel watch = new NotificationChannel(WATCH, context.getString(R.string.watch_channel), NotificationManager.IMPORTANCE_LOW);
        watch.setDescription(context.getString(R.string.watch_channel_desc));
        watch.setSound(null, null);
        watch.enableVibration(false);
        manager.createNotificationChannel(alerts);
        manager.createNotificationChannel(watch);
        NotificationChannel scorecard = new NotificationChannel(SCORECARD, context.getString(R.string.scorecard_channel), NotificationManager.IMPORTANCE_DEFAULT);
        scorecard.setDescription(context.getString(R.string.scorecard_channel_desc));
        scorecard.setSound(null, null);
        scorecard.enableVibration(false);
        manager.createNotificationChannel(scorecard);
        // v0.3.0 moved goals off betspapa.alerts. A channel created without its cheer,
        // or deleted by the user, drops the post with no error. Refresh the four goal
        // channels once on this version, then recreate any that are missing.
        SharedPreferences prefs = context.getSharedPreferences(WatchScheduler.PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean("goal_channels_v3", false)) {
            manager.deleteNotificationChannel(GOAL_CROWD);
            manager.deleteNotificationChannel(GOAL_AFRO);
            manager.deleteNotificationChannel(GOAL_CHANT);
            manager.deleteNotificationChannel(GOAL_OFF);
            prefs.edit().putBoolean("goal_channels_v3", true).apply();
        }
        goalChannel(manager, context, GOAL_CROWD, R.string.goal_channel_crowd, R.raw.cheer_crowd);
        goalChannel(manager, context, GOAL_AFRO, R.string.goal_channel_afro, R.raw.cheer_afro);
        goalChannel(manager, context, GOAL_CHANT, R.string.goal_channel_chant, R.raw.cheer_chant);
        goalChannel(manager, context, GOAL_PAPA, R.string.goal_channel_papa, R.raw.cheer_papa);
        NotificationChannel silent = manager.getNotificationChannel(GOAL_OFF);
        if (silent != null && silent.getSound() != null) manager.deleteNotificationChannel(GOAL_OFF);
        silent = new NotificationChannel(GOAL_OFF, context.getString(R.string.goal_channel_off), NotificationManager.IMPORTANCE_HIGH);
        silent.setDescription(context.getString(R.string.goal_channel_desc));
        silent.setSound(null, null);
        manager.createNotificationChannel(silent);
    }

    private static void goalChannel(NotificationManager manager, Context context, String id, int label, int raw) {
        Uri expected = rawUri(context, raw);
        NotificationChannel existing = manager.getNotificationChannel(id);
        if (existing != null && existing.getSound() == null) {
            manager.deleteNotificationChannel(id);
            existing = null;
        }
        NotificationChannel channel = existing != null
            ? existing
            : new NotificationChannel(id, context.getString(label), NotificationManager.IMPORTANCE_HIGH);
        if (existing == null) {
            channel.setDescription(context.getString(R.string.goal_channel_desc));
            AudioAttributes audio = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
            channel.setSound(expected, audio);
            manager.createNotificationChannel(channel);
        }
    }

    static String channelFor(String kind, String goalSound) {
        if (!"goal".equals(kind)) return ALERTS;
        if ("afro".equals(goalSound)) return GOAL_AFRO;
        if ("chant".equals(goalSound)) return GOAL_CHANT;
        if ("papa".equals(goalSound)) return GOAL_PAPA;
        if ("off".equals(goalSound)) return GOAL_OFF;
        return GOAL_CROWD;
    }

    static Uri soundFor(Context context, String kind, String goalSound) {
        if (!"goal".equals(kind) || "off".equals(goalSound)) return null;
        if ("afro".equals(goalSound)) return rawUri(context, R.raw.cheer_afro);
        if ("chant".equals(goalSound)) return rawUri(context, R.raw.cheer_chant);
        if ("papa".equals(goalSound)) return rawUri(context, R.raw.cheer_papa);
        return rawUri(context, R.raw.cheer_crowd);
    }

    private static Uri rawUri(Context context, int raw) {
        return Uri.parse("android.resource://" + context.getPackageName() + "/" + raw);
    }

    static Notification watching(Context context, int liveCount, boolean aboutToStart) {
        ensure(context);
        String title = context.getString(R.string.watch_title);
        String body = context.getString(R.string.watch_body);
        if (liveCount > 0) {
            title = context.getResources().getQuantityString(R.plurals.watch_live, liveCount, liveCount);
            body = context.getString(R.string.watch_body_live);
        } else if (aboutToStart) {
            body = context.getString(R.string.watch_body_soon);
        }
        return new NotificationCompat.Builder(context, WATCH)
            .setSmallIcon(R.drawable.ic_stat_score)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setContentIntent(openApp(context))
            .build();
    }

    static Notification watching(Context context) {
        WatchState state = WatchState.load(WatchFiles.file(context));
        long now = System.currentTimeMillis();
        int live = AlertPlanner.liveCount(state.matches, state);
        boolean soon = live == 0 && AlertPlanner.shouldWatch(state.matches, state, now);
        return watching(context, live, soon);
    }

    static boolean post(Context context, WatchNote note) {
        return post(context, note, "crowd");
    }

    static boolean post(Context context, WatchNote note, String goalSound) {
        return post(context, note, goalSound, 0, false);
    }

    /**
     * @param replaceId when non-zero, updates that notification instead of hashing the note id
     */
    static boolean post(Context context, WatchNote note, String goalSound, int replaceId, boolean onlyOnce) {
        ensure(context);
        if (note == null) return false;
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false;
        boolean goalChannel = "goal".equals(note.kind) || "var".equals(note.kind) || note.disallowed;
        String channel = goalChannel ? channelFor("goal", goalSound) : channelFor(note.kind, goalSound);
        int id = replaceId != 0 ? replaceId : AlertPlanner.notificationId(note.id);
        if ("goal".equals(note.kind) && replaceId == 0) {
            VarSlots.Slot slot = VarSlots.take(context, note.matchId);
            if (slot != null) {
                id = slot.id;
                if (slot.player != null && !slot.player.isEmpty()) note.player = slot.player;
                if (note.minute == null) note.minute = slot.minute;
            }
        }
        if ("var".equals(note.kind) && !note.disallowed && replaceId == 0) {
            VarSlots.remember(context, note.matchId, id, note.player, note.minute == null ? 0 : note.minute, note.id);
        }
        boolean silent = note.disallowed || "var".equals(note.kind) || ("goal".equals(note.kind) && "off".equals(goalSound));
        WatchMatch match = findMatch(context, note.matchId);
        boolean dark = NotifTheme.dark(context, styleOf(context));
        NotificationCompat.Builder builder = base(context, channel, note.title, note.body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(!note.disallowed)
            .setCategory(Notification.CATEGORY_EVENT)
            .setOnlyAlertOnce(onlyOnce || note.disallowed || "var".equals(note.kind))
            .setGroup("betspapa-" + id)
            .setContentIntent(openApp(context));
        Uri sound = soundFor(context, "goal".equals(note.kind) ? "goal" : note.kind, goalSound);
        if (silent || (sound == null && "goal".equals(note.kind))) builder.setSilent(true);
        else if (sound != null && "goal".equals(note.kind)) builder.setSound(sound);
        try {
            ScoreCards.attach(context, builder, note, match, dark);
        } catch (RuntimeException error) {
            builder.setStyle(new NotificationCompat.BigTextStyle().bigText(note.body));
        }
        return notify(context, id, builder.build());
    }

    /** Ongoing score card. Same id per match. Score-unchanged updates do not alert again. */
    static void postLive(Context context, WatchMatch match, boolean onlyAlertOnce) {
        if (match == null || match.id == null || match.id.isEmpty()) return;
        ensure(context);
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return;
        WatchNote note = new WatchNote("live:" + match.id, match.id, "live", liveTitle(match), liveBody(match));
        note.minute = match.minute;
        boolean dark = NotifTheme.dark(context, styleOf(context));
        NotificationCompat.Builder builder = base(context, SCORECARD, note.title, note.body)
            .setOngoing(true)
            .setOnlyAlertOnce(onlyAlertOnce)
            .setGroup("betspapa-live-" + match.id)
            .setCategory(Notification.CATEGORY_STATUS)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(openApp(context));
        try {
            ScoreCards.attach(context, builder, note, match, dark);
        } catch (RuntimeException error) {
            builder.setStyle(new NotificationCompat.BigTextStyle().bigText(note.body));
        }
        notify(context, AlertPlanner.notificationId("live:" + match.id), builder.build());
    }

    static void refreshLive(Context context) {
        WatchState state = WatchState.load(WatchFiles.file(context));
        SharedPreferences prefs = context.getSharedPreferences(WatchScheduler.PREFS, Context.MODE_PRIVATE);
        Set<String> liveIds = new HashSet<String>();
        if (state.browser && NotificationManagerCompat.from(context).areNotificationsEnabled()) {
            for (WatchMatch match : state.matches) {
                if (!state.relevant(match)) continue;
                boolean live = "live".equals(match.status) || "halftime".equals(match.status);
                if (!live) continue;
                liveIds.add(match.id);
                String sig = score(match.homeScore) + "-" + score(match.awayScore);
                String key = "live-sig-" + match.id;
                boolean changed = !sig.equals(prefs.getString(key, ""));
                postLive(context, match, !changed);
                prefs.edit().putString(key, sig).apply();
            }
        }
        String previous = prefs.getString("live-ids", "");
        for (String id : previous.split(",")) {
            if (id.isEmpty() || liveIds.contains(id)) continue;
            NotificationManagerCompat.from(context).cancel(AlertPlanner.notificationId("live:" + id));
            prefs.edit().remove("live-sig-" + id).apply();
        }
        StringBuilder joined = new StringBuilder();
        for (String id : liveIds) {
            if (joined.length() > 0) joined.append(',');
            joined.append(id);
        }
        prefs.edit().putString("live-ids", joined.toString()).apply();
    }

    /** A VAR review that did not become a goal updates the same notification. */
    static void settleDisallowed(Context context) {
        WatchState state = WatchState.load(WatchFiles.file(context));
        String sound = state.goalSound == null || state.goalSound.isEmpty() ? "crowd" : state.goalSound;
        for (WatchMatch match : state.matches) {
            if (match.varReview != null) continue;
            VarSlots.Slot slot = VarSlots.peek(context, match.id);
            if (slot == null) continue;
            VarSlots.take(context, match.id);
            WatchNote note = new WatchNote(slot.noteId.isEmpty() ? match.id + ":var:disallowed" : slot.noteId, match.id, "var", "VAR", "Disallowed");
            note.player = slot.player;
            note.minute = slot.minute;
            note.disallowed = true;
            post(context, note, sound, slot.id, true);
        }
    }

    private static NotificationCompat.Builder base(Context context, String channel, String title, String body) {
        return new NotificationCompat.Builder(context, channel)
            .setSmallIcon(R.drawable.ic_stat_score)
            .setColor(0xFFE11D2E)
            .setContentTitle(title == null ? "" : title)
            .setContentText(body == null ? "" : body);
    }

    private static boolean notify(Context context, int id, Notification notification) {
        try {
            NotificationManagerCompat.from(context).notify(id, notification);
            return true;
        } catch (SecurityException error) {
            return false;
        }
    }

    private static WatchMatch findMatch(Context context, String id) {
        if (id == null || id.isEmpty()) return null;
        WatchState state = WatchState.load(WatchFiles.file(context));
        for (WatchMatch match : state.matches) {
            if (id.equals(match.id)) return match;
        }
        return null;
    }

    private static String styleOf(Context context) {
        WatchState state = WatchState.load(WatchFiles.file(context));
        return state.notificationStyle == null ? "auto" : state.notificationStyle;
    }

    private static String liveTitle(WatchMatch match) {
        int home = score(match.homeScore);
        int away = score(match.awayScore);
        return "LIVE · " + match.home + " " + home + "\u2013" + away + " " + match.away;
    }

    private static String liveBody(WatchMatch match) {
        if (match.competition != null && !match.competition.isEmpty()) return match.competition;
        return "Live score";
    }

    private static int score(Integer value) {
        return value == null ? 0 : value;
    }

    private static PendingIntent openApp(Context context) {
        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(context, 0, open, flags);
    }
}

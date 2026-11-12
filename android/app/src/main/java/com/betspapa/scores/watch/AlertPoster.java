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
import com.betspapa.watch.WatchNote;
import com.betspapa.watch.WatchState;

public final class AlertPoster {
    static final String ALERTS = "betspapa.alerts";
    static final String WATCH = "betspapa.watch";
    static final String GOAL_CROWD = "betspapa.goal.crowd";
    static final String GOAL_AFRO = "betspapa.goal.afro";
    static final String GOAL_CHANT = "betspapa.goal.chant";
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
        if ("off".equals(goalSound)) return GOAL_OFF;
        return GOAL_CROWD;
    }

    static Uri soundFor(Context context, String kind, String goalSound) {
        if (!"goal".equals(kind) || "off".equals(goalSound)) return null;
        if ("afro".equals(goalSound)) return rawUri(context, R.raw.cheer_afro);
        if ("chant".equals(goalSound)) return rawUri(context, R.raw.cheer_chant);
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
        ensure(context);
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false;
        String channel = channelFor(note.kind, goalSound);
        Uri sound = soundFor(context, note.kind, goalSound);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channel)
            .setSmallIcon(R.drawable.ic_stat_score)
            .setContentTitle(note.title)
            .setContentText(note.body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(note.body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setCategory(Notification.CATEGORY_EVENT)
            .setContentIntent(openApp(context));
        if (sound != null) builder.setSound(sound);
        else if ("goal".equals(note.kind)) builder.setSilent(true);
        Notification notification = builder.build();
        try {
            NotificationManagerCompat.from(context).notify(AlertPlanner.notificationId(note.id), notification);
            return true;
        } catch (SecurityException error) {
            return false;
        }
    }

    private static PendingIntent openApp(Context context) {
        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(context, 0, open, flags);
    }
}

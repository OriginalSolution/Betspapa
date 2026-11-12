package com.betspapa.scores.watch;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.betspapa.scores.MainActivity;
import com.betspapa.scores.R;
import com.betspapa.watch.AlertPlanner;
import com.betspapa.watch.WatchNote;

final class AlertPoster {
    static final String ALERTS = "betspapa.alerts";
    static final String WATCH = "betspapa.watch";

    private AlertPoster() {}

    static void ensure(Context context) {
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
    }

    static Notification watching(Context context, boolean aboutToStart) {
        ensure(context);
        String body = context.getString(aboutToStart ? R.string.watch_body_soon : R.string.watch_body);
        return new NotificationCompat.Builder(context, WATCH)
            .setSmallIcon(R.drawable.ic_stat_score)
            .setContentTitle(context.getString(R.string.watch_title))
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(openApp(context))
            .build();
    }

    static boolean post(Context context, WatchNote note) {
        ensure(context);
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false;
        Notification notification = new NotificationCompat.Builder(context, ALERTS)
            .setSmallIcon(R.drawable.ic_stat_score)
            .setContentTitle(note.title)
            .setContentText(note.body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(note.body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setCategory(Notification.CATEGORY_EVENT)
            .setContentIntent(openApp(context))
            .build();
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

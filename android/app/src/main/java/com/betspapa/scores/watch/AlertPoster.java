package com.betspapa.scores.watch;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.AudioManager;
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
    /**
     * v4 ids. A channel is immutable, and 0.3.x created these without a version
     * using a numeric resource URI that HiOS will not play. New ids are the only
     * way to attach the raw-name sound at HIGH importance.
     */
    static final String GOAL_CROWD = "betspapa.goal.crowd.v4";
    static final String GOAL_AFRO = "betspapa.goal.afro.v4";
    static final String GOAL_CHANT = "betspapa.goal.chant.v4";
    static final String GOAL_PAPA = "betspapa.goal.papa.v4";
    static final String GOAL_HORN = "betspapa.goal.horn.v4";
    static final String GOAL_ARP = "betspapa.goal.arp.v4";
    static final String GOAL_OFF = "betspapa.goal.off.v4";
    static final String RED_CARD = "betspapa.redcard.v1";
    static final String VAR_CHECK = "betspapa.var.v1";
    static final String PENALTY = "betspapa.penalty.v1";
    private static final String CHANNELS_READY = "goal_channels_v4";
    private static final String[] LEGACY_CHANNELS = {
        "betspapa.goal.crowd",
        "betspapa.goal.afro",
        "betspapa.goal.chant",
        "betspapa.goal.papa",
        "betspapa.goal.off",
        ALERTS
    };

    private AlertPoster() {}

    public static void ensure(Context context) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel watch = new NotificationChannel(WATCH, context.getString(R.string.watch_channel), NotificationManager.IMPORTANCE_LOW);
        watch.setDescription(context.getString(R.string.watch_channel_desc));
        watch.setSound(null, null);
        watch.enableVibration(false);
        manager.createNotificationChannel(watch);
        NotificationChannel scorecard = new NotificationChannel(SCORECARD, context.getString(R.string.scorecard_channel), NotificationManager.IMPORTANCE_DEFAULT);
        scorecard.setDescription(context.getString(R.string.scorecard_channel_desc));
        scorecard.setSound(null, null);
        scorecard.enableVibration(false);
        manager.createNotificationChannel(scorecard);
        SharedPreferences prefs = context.getSharedPreferences(WatchScheduler.PREFS, Context.MODE_PRIVATE);
        boolean first = !prefs.getBoolean(CHANNELS_READY, false);
        if (first) {
            for (String legacy : LEGACY_CHANNELS) manager.deleteNotificationChannel(legacy);
            // Drop a bad v4 channel too, in case a previous process created it before the sound was right.
            manager.deleteNotificationChannel(GOAL_CROWD);
            manager.deleteNotificationChannel(GOAL_AFRO);
            manager.deleteNotificationChannel(GOAL_CHANT);
            manager.deleteNotificationChannel(GOAL_PAPA);
            manager.deleteNotificationChannel(GOAL_OFF);
        }
        goalChannel(manager, context, GOAL_CROWD, R.string.goal_channel_crowd, R.raw.cheer_crowd, first);
        goalChannel(manager, context, GOAL_AFRO, R.string.goal_channel_afro, R.raw.cheer_afro, first);
        goalChannel(manager, context, GOAL_CHANT, R.string.goal_channel_chant, R.raw.cheer_chant, first);
        goalChannel(manager, context, GOAL_PAPA, R.string.goal_channel_papa, R.raw.cheer_papa, first);
        goalChannel(manager, context, GOAL_HORN, R.string.goal_channel_horn, R.raw.goal_horn, false);
        goalChannel(manager, context, GOAL_ARP, R.string.goal_channel_arp, R.raw.goal_arp, false);
        goalChannel(manager, context, RED_CARD, R.string.red_channel, R.raw.red_card, false);
        goalChannel(manager, context, VAR_CHECK, R.string.var_channel, R.raw.var_check, false);
        goalChannel(manager, context, PENALTY, R.string.penalty_channel, R.raw.penalty, false);
        silentChannel(manager, context, first);
        if (first) prefs.edit().putBoolean(CHANNELS_READY, true).commit();
    }

    private static void goalChannel(NotificationManager manager, Context context, String id, int label, int raw, boolean replace) {
        Uri expected = rawUri(context, raw);
        NotificationChannel existing = manager.getNotificationChannel(id);
        if (existing != null && !replace) return;
        if (existing != null) manager.deleteNotificationChannel(id);
        NotificationChannel channel = new NotificationChannel(id, context.getString(label), NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription(context.getString(R.string.goal_channel_desc));
        channel.setSound(expected, notificationAudio());
        channel.enableVibration(true);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(channel);
    }

    private static void silentChannel(NotificationManager manager, Context context, boolean replace) {
        NotificationChannel existing = manager.getNotificationChannel(GOAL_OFF);
        if (existing != null && !replace) return;
        if (existing != null) manager.deleteNotificationChannel(GOAL_OFF);
        NotificationChannel silent = new NotificationChannel(GOAL_OFF, context.getString(R.string.goal_channel_off), NotificationManager.IMPORTANCE_HIGH);
        silent.setDescription(context.getString(R.string.goal_channel_desc));
        silent.setSound(null, null);
        silent.enableVibration(false);
        silent.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(silent);
    }

    /** Crowd, Afrobeats, Chant, Papa Shout, or Off. Read from the file the watcher persists, not from the WebView. */
    static String selectedSound(Context context) {
        WatchState state = WatchState.load(WatchFiles.file(context));
        if (state.goalSound == null || state.goalSound.isEmpty()) return "crowd";
        return state.goalSound;
    }

    /** True when the selected cheer can actually be heard. Off, a muted channel, or a silent ringer is false. */
    static boolean notificationSoundOn(Context context) {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false;
        if ("off".equals(selectedSound(context))) return false;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            if (manager == null) return false;
            NotificationChannel channel = manager.getNotificationChannel(channelFor("goal", selectedSound(context)));
            if (channel == null || channel.getImportance() < NotificationManager.IMPORTANCE_DEFAULT || channel.getSound() == null) return false;
        }
        return streamCanPlay(context);
    }

    /** The user picked a cheer, notifications are allowed, and the phone will still not play it. */
    static boolean notificationSoundBlocked(Context context) {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false;
        if ("off".equals(selectedSound(context))) return false;
        return !notificationSoundOn(context);
    }

    static String channelIdForSelected(Context context) {
        return channelFor("goal", selectedSound(context));
    }

    private static boolean streamCanPlay(Context context) {
        AudioManager audio = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        if (audio == null) return true;
        int ringer = audio.getRingerMode();
        if (ringer == AudioManager.RINGER_MODE_SILENT || ringer == AudioManager.RINGER_MODE_VIBRATE) return false;
        return audio.getStreamVolume(AudioManager.STREAM_NOTIFICATION) > 0;
    }

    static boolean wantsSound(String kind, String goalSound, boolean disallowed) {
        return wantsSound(kind, goalSound, disallowed, false, eventSounds(null));
    }

    static boolean wantsSound(String kind, String goalSound, boolean disallowed, boolean preview, EventSounds sounds) {
        if (disallowed) return false;
        if ("red".equals(kind)) return preview || sounds.red;
        if ("var".equals(kind)) return preview || sounds.varOn;
        if ("penalty".equals(kind)) return preview || sounds.penalty;
        if ("off".equals(goalSound)) return false;
        if (kind == null || "live".equals(kind)) return false;
        return true;
    }

    static String channelFor(String kind, String goalSound) {
        return channelFor(kind, goalSound, false, eventSounds(null));
    }

    static String channelFor(String kind, String goalSound, boolean preview, EventSounds sounds) {
        if (!wantsSound(kind, goalSound, false, preview, sounds)) return GOAL_OFF;
        if ("red".equals(kind)) return RED_CARD;
        if ("var".equals(kind)) return VAR_CHECK;
        if ("penalty".equals(kind)) return PENALTY;
        if ("afro".equals(goalSound)) return GOAL_AFRO;
        if ("chant".equals(goalSound)) return GOAL_CHANT;
        if ("papa".equals(goalSound)) return GOAL_PAPA;
        if ("horn".equals(goalSound)) return GOAL_HORN;
        if ("arp".equals(goalSound)) return GOAL_ARP;
        return GOAL_CROWD;
    }

    static Uri soundFor(Context context, String kind, String goalSound) {
        return soundFor(context, kind, goalSound, false, eventSounds(context));
    }

    static Uri soundFor(Context context, String kind, String goalSound, boolean preview, EventSounds sounds) {
        if (!wantsSound(kind, goalSound, false, preview, sounds)) return null;
        if ("red".equals(kind)) return rawUri(context, R.raw.red_card);
        if ("var".equals(kind)) return rawUri(context, R.raw.var_check);
        if ("penalty".equals(kind)) return rawUri(context, R.raw.penalty);
        if ("afro".equals(goalSound)) return rawUri(context, R.raw.cheer_afro);
        if ("chant".equals(goalSound)) return rawUri(context, R.raw.cheer_chant);
        if ("papa".equals(goalSound)) return rawUri(context, R.raw.cheer_papa);
        if ("horn".equals(goalSound)) return rawUri(context, R.raw.goal_horn);
        if ("arp".equals(goalSound)) return rawUri(context, R.raw.goal_arp);
        return rawUri(context, R.raw.cheer_crowd);
    }

    static final class EventSounds {
        final boolean red;
        final boolean varOn;
        final boolean penalty;

        EventSounds(boolean red, boolean varOn, boolean penalty) {
            this.red = red;
            this.varOn = varOn;
            this.penalty = penalty;
        }
    }

    static EventSounds eventSounds(Context context) {
        if (context == null) return new EventSounds(true, true, true);
        WatchState state = WatchState.load(WatchFiles.file(context));
        return new EventSounds(state.redSound, state.varSound, state.penaltySound);
    }

    /** Name form. HiOS does not resolve android.resource://pkg/&lt;numeric id&gt;. */
    static Uri rawUri(Context context, int raw) {
        String name = context.getResources().getResourceEntryName(raw);
        return Uri.parse("android.resource://" + context.getPackageName() + "/raw/" + name);
    }

    static AudioAttributes notificationAudio() {
        return new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
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
        boolean preview = note.id != null && note.id.startsWith("test:");
        EventSounds sounds = eventSounds(context);
        boolean soundOn = wantsSound(note.kind, goalSound, note.disallowed, preview, sounds);
        String channel = soundOn ? channelFor(note.kind, goalSound, preview, sounds) : GOAL_OFF;
        int id = replaceId != 0 ? replaceId : AlertPlanner.notificationId(note.id);
        if ("goal".equals(note.kind) && replaceId == 0) {
            VarSlots.Slot slot = VarSlots.take(context, note.matchId);
            if (slot != null) {
                // A VAR post is silent. Updating that same record keeps HiOS from playing the goal.
                // Cancel it, then post the goal on the cheer channel as a new alert with the same id.
                if (slot.noteId != null && !slot.noteId.isEmpty()) NotificationManagerCompat.from(context).cancel(slot.noteId, slot.id);
                NotificationManagerCompat.from(context).cancel(slot.id);
                id = slot.id;
                if (slot.player != null && !slot.player.isEmpty()) note.player = slot.player;
                if (note.minute == null) note.minute = slot.minute;
            }
        }
        if ("var".equals(note.kind) && !note.disallowed && replaceId == 0) {
            VarSlots.remember(context, note.matchId, id, note.player, note.minute == null ? 0 : note.minute, note.id);
        }
        WatchMatch match = findMatch(context, note.matchId);
        boolean dark = NotifTheme.dark(context, styleOf(context));
        NotificationCompat.Builder builder = base(context, channel, note.title, note.body)
            .setPriority(soundOn ? NotificationCompat.PRIORITY_HIGH : NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(!note.disallowed)
            .setCategory(Notification.CATEGORY_EVENT)
            .setOnlyAlertOnce(!soundOn || onlyOnce)
            .setGroup("betspapa-" + id)
            // A grouped child with the platform default is muted on HiOS, which treats it as summary-only.
            .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN)
            .setContentIntent(OpenMatch.forNote(context, note));
        Uri sound = soundOn ? soundFor(context, note.kind, goalSound, preview, sounds) : null;
        if (sound == null) builder.setSilent(true);
        try {
            ScoreCards.attach(context, builder, note, match, dark);
        } catch (RuntimeException error) {
            builder.setStyle(new NotificationCompat.BigTextStyle().bigText(note.body));
        }
        Notification notification = builder.build();
        // Compat only has setSound(Uri, stream). Write the same URI and usage the channel uses
        // so HiOS, which plays notification.sound, resolves raw/name instead of dropping it.
        if (sound != null) {
            notification.sound = sound;
            notification.audioAttributes = notificationAudio();
        }
        return notify(context, note.id, id, notification);
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
            .setContentIntent(OpenMatch.forNote(context, note));
        try {
            ScoreCards.attach(context, builder, note, match, dark);
        } catch (RuntimeException error) {
            builder.setStyle(new NotificationCompat.BigTextStyle().bigText(note.body));
        }
        notify(context, "live:" + match.id, AlertPlanner.notificationId("live:" + match.id), builder.build());
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
            NotificationManagerCompat.from(context).cancel("live:" + id, AlertPlanner.notificationId("live:" + id));
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

    private static boolean notify(Context context, String tag, int id, Notification notification) {
        try {
            if (tag == null || tag.isEmpty()) NotificationManagerCompat.from(context).notify(id, notification);
            else NotificationManagerCompat.from(context).notify(tag, id, notification);
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

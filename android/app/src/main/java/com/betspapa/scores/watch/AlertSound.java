package com.betspapa.scores.watch;

import android.content.Context;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.os.SystemClock;

/**
 * HyperOS creates a new app's notification channels with Sound off, and it does not
 * report that through {@code NotificationChannel.getImportance()} or {@code getSound()}.
 * The shade card still appears. The custom raw sound does not. Playing it here, on the
 * notification stream, is what the owner hears on Xiaomi, Redmi, and POCO. Stock Android
 * and HiOS keep using the channel sound and do not get a second copy.
 */
public final class AlertSound {
    /** Unit tests set this. Production leaves it null and reads the phone. */
    static String brandOverride;
    static volatile Uri lastPlayed;

    private static MediaPlayer player;
    private static PowerManager.WakeLock wake;
    private static volatile boolean playing;

    private AlertSound() {}

    static String brand(Context context) {
        if (brandOverride != null) return brandOverride;
        return AutostartGuide.brandId(Build.MANUFACTURER, Build.BRAND);
    }

    static boolean playsInProcess(String brandId) {
        return "xiaomi".equals(brandId);
    }

    static boolean isPlaying() {
        return playing;
    }

    static void play(Context context, Uri uri) {
        if (context == null || uri == null || !playsInProcess(brand(context))) return;
        lastPlayed = uri;
        Context app = context.getApplicationContext();
        MediaPlayer next = new MediaPlayer();
        try {
            next.setAudioAttributes(AlertPoster.notificationAudio());
            next.setDataSource(app, uri);
            next.setOnCompletionListener(AlertSound::finish);
            next.setOnErrorListener((mp, what, extra) -> {
                finish(mp);
                return true;
            });
            next.prepare();
            acquire(app);
            MediaPlayer previous;
            synchronized (AlertSound.class) {
                previous = player;
                player = next;
                playing = true;
            }
            if (previous != null) releasePlayer(previous);
            next.start();
            Thread watcher = new Thread(() -> {
                long end = SystemClock.uptimeMillis() + 8_000L;
                while (playing && SystemClock.uptimeMillis() < end) {
                    try {
                        Thread.sleep(150L);
                    } catch (InterruptedException error) {
                        break;
                    }
                }
                finish(next);
            }, "alert-sound");
            watcher.setDaemon(true);
            watcher.start();
        } catch (Throwable error) {
            synchronized (AlertSound.class) {
                if (player == next) player = null;
                playing = false;
            }
            releasePlayer(next);
            releaseWake();
        }
    }

    /** Keeps a just-woken process alive until the cheer finishes. Returns immediately when nothing is playing. */
    static void await(long maxMs) {
        long end = SystemClock.uptimeMillis() + Math.max(0L, maxMs);
        while (playing && SystemClock.uptimeMillis() < end) {
            try {
                Thread.sleep(100L);
            } catch (InterruptedException error) {
                break;
            }
        }
    }

    private static void acquire(Context context) {
        PowerManager power = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        if (power == null) return;
        PowerManager.WakeLock next = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "betspapa:alert-sound");
        next.setReferenceCounted(false);
        next.acquire(10_000L);
        wake = next;
    }

    private static void finish(MediaPlayer mp) {
        if (mp == null) return;
        synchronized (AlertSound.class) {
            if (player == mp) {
                player = null;
                playing = false;
            }
        }
        releasePlayer(mp);
        releaseWake();
    }

    private static void releasePlayer(MediaPlayer mp) {
        try {
            if (mp.isPlaying()) mp.stop();
        } catch (RuntimeException ignored) {
            /* already stopped */
        }
        try {
            mp.release();
        } catch (RuntimeException ignored) {
            /* already released */
        }
    }

    private static void releaseWake() {
        PowerManager.WakeLock held = wake;
        wake = null;
        if (held != null && held.isHeld()) held.release();
    }
}

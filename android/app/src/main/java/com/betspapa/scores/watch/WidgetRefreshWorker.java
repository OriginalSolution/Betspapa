package com.betspapa.scores.watch;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import com.betspapa.watch.MatchFeeds;
import com.betspapa.watch.MatchParser;
import com.betspapa.watch.WatchMatch;
import com.betspapa.watch.WatchState;
import com.betspapa.watch.WidgetBoard;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * Fetches fixtures and live scores from api.betspapa.com, keeps the followed matches,
 * and redraws every widget. Every 15 minutes, and every 5 while a followed match is live.
 */
public class WidgetRefreshWorker extends Worker {
    /** Our own API only. Never a relative path, never a bookmaker host. */
    static final String FIXTURES_URL = MatchFeeds.FIXTURES;
    static final String LIVE_URL = "https://api.betspapa.com/api/live";
    static final String PERIODIC = "betspapa-widget-periodic";
    static final String SOON = "betspapa-widget-soon";
    static final long LIVE_EVERY_MIN = 5L;

    public WidgetRefreshWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        if (!ScoreWidget.hasWidgets(context)) return Result.success();
        boolean failed = false;
        List<WatchMatch> fixtures = Collections.emptyList();
        List<WatchMatch> live = Collections.emptyList();
        try {
            fixtures = MatchParser.parseUpcoming(FeedClient.get(context, FIXTURES_URL));
        } catch (Exception error) {
            failed = true;
        }
        try {
            live = MatchParser.parseLive(FeedClient.get(context, LIVE_URL));
        } catch (Exception error) {
            failed = true;
        }
        WatchState state = WatchState.load(WatchFiles.file(context));
        long now = System.currentTimeMillis();
        List<WatchMatch> rows = Collections.emptyList();
        if (!fixtures.isEmpty() || !live.isEmpty()) {
            List<WatchMatch> previous = WidgetStore.load(context).matches;
            rows = WidgetBoard.rows(WidgetBoard.merge(previous, fixtures, live), state, now);
            WidgetStore.save(context, new ArrayList<WatchMatch>(rows), now);
        }
        ScoreWidget.renderAll(context);
        if (WidgetBoard.anyLive(rows) || WidgetBoard.anyLive(WidgetBoard.rows(state.matches, state, now))) scheduleSoon(context, LIVE_EVERY_MIN);
        return failed && fixtures.isEmpty() && live.isEmpty() ? Result.retry() : Result.success();
    }

    private static Constraints online() {
        return new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
    }

    static void schedulePeriodic(Context context) {
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(WidgetRefreshWorker.class, 15, TimeUnit.MINUTES)
            .setConstraints(online())
            .build();
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, request);
    }

    /** A one-off refresh: now for the header button, or a few minutes out while a match is live. */
    static void scheduleSoon(Context context, long delayMinutes) {
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(WidgetRefreshWorker.class)
            .setConstraints(online())
            .setInitialDelay(delayMinutes, TimeUnit.MINUTES)
            .build();
        WorkManager.getInstance(context).enqueueUniqueWork(SOON, ExistingWorkPolicy.REPLACE, request);
    }

    static void cancelAll(Context context) {
        WorkManager.getInstance(context).cancelUniqueWork(PERIODIC);
        WorkManager.getInstance(context).cancelUniqueWork(SOON);
    }
}

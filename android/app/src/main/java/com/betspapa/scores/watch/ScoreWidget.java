package com.betspapa.scores.watch;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.widget.RemoteViews;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Home-screen widget: followed teams, live first, then the next kick-offs.
 * Drawing never touches the network on the main thread; crests come from CrestCache on a worker thread.
 */
public class ScoreWidget extends AppWidgetProvider {
    static final String ACTION_REFRESH = "com.betspapa.scores.widget.REFRESH";
    private static final ExecutorService DRAW = Executors.newSingleThreadExecutor();
    /** Fetch again on update when the cached copy is older than this. */
    private static final long STALE_MS = 15L * 60L * 1000L;

    @Override
    public void onEnabled(Context context) {
        WidgetRefreshWorker.schedulePeriodic(context);
        WidgetRefreshWorker.scheduleSoon(context, 0);
    }

    @Override
    public void onDisabled(Context context) {
        WidgetRefreshWorker.cancelAll(context);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        WidgetRefreshWorker.schedulePeriodic(context);
        if (System.currentTimeMillis() - WidgetStore.load(context).fetchedAt > STALE_MS) WidgetRefreshWorker.scheduleSoon(context, 0);
        drawAsync(context);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        // Android 12+ picks the right size itself; older launchers need a redraw for the new size.
        drawAsync(context);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent != null && ACTION_REFRESH.equals(intent.getAction())) {
            WidgetRefreshWorker.scheduleSoon(context, 0);
            drawAsync(context);
            return;
        }
        super.onReceive(context, intent);
    }

    private void drawAsync(Context context) {
        PendingResult pending = goAsync();
        Context app = context.getApplicationContext();
        DRAW.execute(() -> {
            try {
                renderAll(app);
            } finally {
                pending.finish();
            }
        });
    }

    /** Redraw from what is already on the phone. Live alerts, the poller, and the app call this. */
    public static void nudge(Context context) {
        Context app = context.getApplicationContext();
        if (!hasWidgets(app)) return;
        DRAW.execute(() -> renderAll(app));
    }

    /** The app changed what it follows: redraw now and fetch the new teams' fixtures. */
    public static void followsChanged(Context context) {
        Context app = context.getApplicationContext();
        if (!hasWidgets(app)) return;
        nudge(app);
        WidgetRefreshWorker.scheduleSoon(app, 0);
    }

    static int[] ids(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        if (manager == null) return new int[0];
        return manager.getAppWidgetIds(new ComponentName(context, ScoreWidget.class));
    }

    static boolean hasWidgets(Context context) {
        try {
            return ids(context).length > 0;
        } catch (RuntimeException error) {
            return false;
        }
    }

    static void renderAll(Context context) {
        try {
            AppWidgetManager manager = AppWidgetManager.getInstance(context);
            int[] ids = ids(context);
            if (ids.length == 0) return;
            WidgetRender.Board board = WidgetRender.board(context, System.currentTimeMillis());
            for (int id : ids) {
                RemoteViews views = Build.VERSION.SDK_INT >= 31
                    ? WidgetRender.responsive(context, board)
                    : WidgetRender.forOptions(context, board, manager.getAppWidgetOptions(id));
                manager.updateAppWidget(id, views);
            }
        } catch (RuntimeException ignored) {
            /* the next refresh draws again */
        }
    }

    static PendingIntent refreshIntent(Context context) {
        Intent intent = new Intent(context, ScoreWidget.class);
        intent.setAction(ACTION_REFRESH);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(context, 4211, intent, flags);
    }
}

package com.betspapa.scores.watch;

import android.content.Context;
import android.content.res.Configuration;
import com.betspapa.watch.WatchState;

/** Auto follows the phone. Dark is the Red Ticker. Light is the white score panel. */
public final class NotifTheme {
    private NotifTheme() {}

    public static boolean dark(Context context, String style) {
        String choice = WatchState.normalizeStyle(style);
        if ("dark".equals(choice)) return true;
        if ("light".equals(choice)) return false;
        int night = context.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return night == Configuration.UI_MODE_NIGHT_YES;
    }
}

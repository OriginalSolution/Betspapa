package com.betspapa.scores.watch;

import android.content.Context;
import java.io.File;

final class WatchFiles {
    private WatchFiles() {}

    static File file(Context context) {
        return new File(context.getApplicationContext().getFilesDir(), "betspapa-watch.json");
    }
}

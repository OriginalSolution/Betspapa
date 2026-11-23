package com.betspapa.scores.watch;

import android.content.Context;
import com.betspapa.watch.WatchMatch;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/** The widget's own copy of followed matches from api.betspapa.com, so it works when the watcher is idle. */
final class WidgetStore {
    static final Object LOCK = new Object();

    private WidgetStore() {}

    static File file(Context context) {
        return new File(context.getApplicationContext().getFilesDir(), "betspapa-widget.json");
    }

    static final class Snapshot {
        final List<WatchMatch> matches = new ArrayList<WatchMatch>();
        long fetchedAt;
    }

    static Snapshot load(Context context) {
        Snapshot snapshot = new Snapshot();
        synchronized (LOCK) {
            File file = file(context);
            if (!file.isFile()) return snapshot;
            try (FileInputStream input = new FileInputStream(file)) {
                byte[] bytes = new byte[(int) file.length()];
                int read = 0;
                while (read < bytes.length) {
                    int n = input.read(bytes, read, bytes.length - read);
                    if (n < 0) break;
                    read += n;
                }
                JSONObject json = new JSONObject(new String(bytes, 0, read, StandardCharsets.UTF_8));
                snapshot.fetchedAt = json.optLong("fetchedAt", 0L);
                JSONArray rows = json.optJSONArray("matches");
                if (rows != null) {
                    for (int i = 0; i < rows.length(); i++) {
                        JSONObject row = rows.optJSONObject(i);
                        if (row != null) snapshot.matches.add(WatchMatch.fromJson(row));
                    }
                }
            } catch (Exception ignored) {
                /* a damaged cache is refetched on the next refresh */
            }
        }
        return snapshot;
    }

    static void save(Context context, List<WatchMatch> matches, long fetchedAt) {
        synchronized (LOCK) {
            try {
                JSONObject json = new JSONObject();
                json.put("fetchedAt", fetchedAt);
                JSONArray rows = new JSONArray();
                for (WatchMatch match : matches) rows.put(match.toJson());
                json.put("matches", rows);
                File file = file(context);
                File tmp = new File(file.getAbsolutePath() + ".tmp");
                try (FileOutputStream output = new FileOutputStream(tmp)) {
                    output.write(json.toString().getBytes(StandardCharsets.UTF_8));
                }
                if (!tmp.renameTo(file)) {
                    file.delete();
                    tmp.renameTo(file);
                }
            } catch (Exception ignored) {
                /* the widget keeps showing the last good copy */
            }
        }
    }
}

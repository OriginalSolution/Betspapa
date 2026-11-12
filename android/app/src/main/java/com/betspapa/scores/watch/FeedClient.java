package com.betspapa.scores.watch;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import com.betspapa.watch.MatchFeeds;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.json.JSONObject;

/** Native HTTP with no Origin header, so the fixture API does not answer 403. */
final class FeedClient {
    private static final int MAX_BYTES = 8_000_000;
    static final String OVERRIDE_FILE = "betspapa-feed-override.json";
    private static volatile String fixturesOverride;
    private static volatile String liveOverride;

    private FeedClient() {}

    /** Same-process test hook. Release builds never call this. A null clears it. */
    static void overrideFeeds(String fixtures, String live) {
        fixturesOverride = fixtures;
        liveOverride = live;
    }

    static String get(Context context, String url) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(resolve(context, url)).openConnection();
        connection.setRequestMethod("GET");
        connection.setConnectTimeout(30_000);
        connection.setReadTimeout(90_000);
        connection.setInstanceFollowRedirects(true);
        for (Map.Entry<String, String> header : MatchFeeds.headers().entrySet()) {
            connection.setRequestProperty(header.getKey(), header.getValue());
        }
        try {
            int status = connection.getResponseCode();
            InputStream stream = status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream();
            String body = read(stream);
            if (status < 200 || status >= 300) throw new IOException("Feed returned " + status);
            return body;
        } finally {
            connection.disconnect();
        }
    }

    static String resolve(Context context, String url) {
        if (MatchFeeds.FIXTURES.equals(url) && fixturesOverride != null) return fixturesOverride;
        if (MatchFeeds.LIVE.equals(url) && liveOverride != null) return liveOverride;
        if (context == null || !debuggable(context)) return url;
        String redirected = fileOverride(context, url);
        return redirected == null ? url : redirected;
    }

    private static boolean debuggable(Context context) {
        return (context.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    /** Debug builds only. The QC harness points the watcher at a local server. Release ignores the file. */
    private static String fileOverride(Context context, String url) {
        File file = new File(context.getApplicationContext().getFilesDir(), OVERRIDE_FILE);
        if (!file.isFile()) return null;
        FileInputStream input = null;
        try {
            input = new FileInputStream(file);
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[1024];
            int count;
            while ((count = input.read(chunk)) != -1) buffer.write(chunk, 0, count);
            JSONObject json = new JSONObject(buffer.toString(StandardCharsets.UTF_8.name()));
            if (MatchFeeds.FIXTURES.equals(url)) {
                String next = json.optString("fixtures", "");
                return next.isEmpty() ? null : next;
            }
            if (MatchFeeds.LIVE.equals(url)) {
                String next = json.optString("live", "");
                return next.isEmpty() ? null : next;
            }
            return null;
        } catch (RuntimeException | IOException | org.json.JSONException error) {
            return null;
        } finally {
            if (input != null) {
                try {
                    input.close();
                } catch (IOException ignored) {
                    /* the next poll can read the file again */
                }
            }
        }
    }

    private static String read(InputStream stream) throws IOException {
        if (stream == null) return "";
        try (InputStream input = stream) {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int total = 0;
            int count;
            while ((count = input.read(chunk)) != -1) {
                total += count;
                if (total > MAX_BYTES) throw new IOException("Feed is larger than expected");
                buffer.write(chunk, 0, count);
            }
            return buffer.toString(StandardCharsets.UTF_8.name());
        }
    }
}

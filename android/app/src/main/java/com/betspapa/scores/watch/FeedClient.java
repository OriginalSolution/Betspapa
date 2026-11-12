package com.betspapa.scores.watch;

import com.betspapa.watch.MatchFeeds;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/** Native HTTP with no Origin header, so the fixture API does not answer 403. */
final class FeedClient {
    private static final int MAX_BYTES = 8_000_000;

    private FeedClient() {}

    static String get(String url) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
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

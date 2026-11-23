package com.betspapa.scores.watch;

import android.content.Context;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * FCM can rotate the token while the app is closed. Until now the new token waited
 * in preferences for the next app open, and the server kept pushing to the dead one.
 * This re-sends the last registration the app made, with the new token and the old
 * one named so the server swaps them.
 */
public final class DeviceRegistrar {
    static final String PREFS = "betspapa.push";
    static final String KEY = "registration";
    static final String URL_DEVICES = "https://api.betspapa.com/api/devices";

    private DeviceRegistrar() {}

    /** The JSON body to post, or null when the app never registered. Pure, so it is unit-tested. */
    static String body(String stashed, String token, String previous) {
        if (stashed == null || stashed.isEmpty() || token == null || token.isEmpty()) return null;
        try {
            JSONObject json = new JSONObject(stashed);
            json.put("token", token);
            if (previous != null && !previous.isEmpty() && !previous.equals(token)) json.put("previousToken", previous);
            return json.toString();
        } catch (Exception error) {
            return null;
        }
    }

    public static void onNewToken(Context context, String token, String previous) {
        Context app = context.getApplicationContext();
        String stashed = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "");
        final String payload = body(stashed, token, previous);
        if (payload == null) return;
        new Thread(() -> post(payload), "betspapa-register").start();
    }

    private static void post(String payload) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(URL_DEVICES).openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(15_000);
            connection.setReadTimeout(20_000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            byte[] bytes = payload.getBytes(StandardCharsets.UTF_8);
            try (OutputStream out = connection.getOutputStream()) {
                out.write(bytes);
            }
            connection.getResponseCode();
        } catch (Exception ignored) {
            /* the next app open registers again */
        } finally {
            if (connection != null) connection.disconnect();
        }
    }
}

package com.betspapa.scores.watch;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.Shader;
import android.os.Build;
import com.betspapa.watch.MatchFeeds;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.Locale;
import org.json.JSONObject;

/** Wikipedia club badges, cached as bitmaps. A miss becomes an initials circle. */
final class CrestCache {
    private static final int[] PALETTE = {0xFFE11D2E, 0xFF3D7EFF, 0xFFF0C94A, 0xFF21A366, 0xFFA855F7, 0xFF14B8A6, 0xFF6CABDD};

    private CrestCache() {}

    static Bitmap badge(Context context, String name, String url, String abbr, String color, int size) {
        Bitmap photo = load(context, name, url, size);
        if (photo != null) return photo;
        return initials(abbr, color, name, size);
    }

    private static Bitmap load(Context context, String name, String url, int size) {
        String key = key(name, url);
        File file = new File(cacheDir(context), key + ".png");
        if (file.isFile() && file.length() > 32) {
            Bitmap cached = BitmapFactory.decodeFile(file.getAbsolutePath());
            if (cached != null) return circle(cached, size);
        }
        File miss = new File(cacheDir(context), key + ".miss");
        if (miss.isFile() && System.currentTimeMillis() - miss.lastModified() < 12L * 60L * 60L * 1000L) return null;
        if (!allowNetwork()) return null;
        String resolved = url == null ? "" : url.trim();
        if (resolved.isEmpty()) resolved = wiki(name);
        if (resolved.isEmpty() || resolved.toLowerCase(Locale.US).endsWith(".svg")) {
            touch(miss);
            return null;
        }
        Bitmap fetched = download(resolved);
        if (fetched == null) {
            touch(miss);
            return null;
        }
        try {
            FileOutputStream output = new FileOutputStream(file);
            try {
                fetched.compress(Bitmap.CompressFormat.PNG, 100, output);
            } finally {
                output.close();
            }
        } catch (Exception ignored) {
            /* the circle can still be used this once */
        }
        return circle(fetched, size);
    }

    private static boolean allowNetwork() {
        String finger = Build.FINGERPRINT == null ? "" : Build.FINGERPRINT.toLowerCase(Locale.US);
        return !finger.contains("robolectric");
    }

    private static String wiki(String name) {
        if (name == null || name.trim().isEmpty()) return "";
        try {
            String query = URLEncoder.encode(name.trim() + " football", "UTF-8");
            String address = "https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=" + query
                + "&gsrlimit=4&prop=pageimages|description&piprop=thumbnail&pithumbsize=200&format=json&origin=*";
            JSONObject body = new JSONObject(http(address));
            JSONObject pages = body.optJSONObject("query");
            if (pages == null) return "";
            pages = pages.optJSONObject("pages");
            if (pages == null) return "";
            JSONObject best = null;
            int bestScore = 0;
            java.util.Iterator<String> keys = pages.keys();
            while (keys.hasNext()) {
                JSONObject page = pages.optJSONObject(keys.next());
                if (page == null) continue;
                JSONObject thumb = page.optJSONObject("thumbnail");
                String source = thumb == null ? "" : thumb.optString("source", "");
                if (source.isEmpty() || photo(source)) continue;
                String description = (page.optString("description", "") + " " + page.optString("title", "")).toLowerCase(Locale.US);
                int score = 0;
                if (description.contains("football") || description.contains("soccer")) score += 2;
                if (description.contains("club") || description.contains("f.c")) score += 2;
                if (description.contains("association")) score += 1;
                if (score > bestScore) {
                    bestScore = score;
                    best = page;
                }
            }
            if (best == null || bestScore < 2) return "";
            JSONObject thumb = best.optJSONObject("thumbnail");
            String source = thumb == null ? "" : thumb.optString("source", "");
            if (source.contains("/")) {
                source = source.replaceFirst("/\\d+px-", "/200px-");
            }
            return source;
        } catch (Exception error) {
            return "";
        }
    }

    private static boolean photo(String url) {
        String lower = url.toLowerCase(Locale.US);
        return lower.contains("stadium") || lower.contains("flag_of") || lower.contains("portrait") || lower.contains("team_photo") || lower.contains("squad");
    }

    private static String http(String address) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(address).openConnection();
        connection.setConnectTimeout(2500);
        connection.setReadTimeout(3000);
        connection.setRequestProperty("User-Agent", MatchFeeds.USER_AGENT);
        connection.setRequestProperty("Accept", "application/json");
        try {
            InputStream stream = connection.getInputStream();
            try {
                byte[] buffer = new byte[4096];
                java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
                int count;
                while ((count = stream.read(buffer)) != -1) output.write(buffer, 0, count);
                return output.toString("UTF-8");
            } finally {
                stream.close();
            }
        } finally {
            connection.disconnect();
        }
    }

    private static Bitmap download(String address) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(address).openConnection();
            connection.setConnectTimeout(2500);
            connection.setReadTimeout(4000);
            connection.setRequestProperty("User-Agent", MatchFeeds.USER_AGENT);
            InputStream stream = connection.getInputStream();
            try {
                return BitmapFactory.decodeStream(stream);
            } finally {
                stream.close();
            }
        } catch (Exception error) {
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static Bitmap circle(Bitmap source, int size) {
        int edge = Math.max(8, size);
        Bitmap scaled = Bitmap.createBitmap(edge, edge, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(scaled);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        Rect src = cover(source.getWidth(), source.getHeight());
        Bitmap cropped = Bitmap.createBitmap(source, src.left, src.top, src.width(), src.height());
        Bitmap square = Bitmap.createScaledBitmap(cropped, edge, edge, true);
        paint.setShader(new BitmapShader(square, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP));
        canvas.drawCircle(edge / 2f, edge / 2f, edge / 2f, paint);
        if (cropped != source) cropped.recycle();
        if (square != cropped) square.recycle();
        return scaled;
    }

    private static Rect cover(int width, int height) {
        int edge = Math.min(width, height);
        int left = Math.max(0, (width - edge) / 2);
        int top = Math.max(0, (height - edge) / 2);
        return new Rect(left, top, left + edge, top + edge);
    }

    static Bitmap initials(String abbr, String color, String name, int size) {
        int edge = Math.max(8, size);
        Bitmap bitmap = Bitmap.createBitmap(edge, edge, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        int fill = colorOf(color, name);
        paint.setColor(fill);
        canvas.drawCircle(edge / 2f, edge / 2f, edge / 2f, paint);
        paint.setColor(light(fill) ? 0xFF14161C : Color.WHITE);
        paint.setFakeBoldText(true);
        paint.setTextAlign(Paint.Align.CENTER);
        paint.setTextSize(edge * (abbr != null && abbr.length() > 2 ? 0.34f : 0.4f));
        String text = abbr == null || abbr.isEmpty() ? "TM" : abbr;
        Paint.FontMetrics metrics = paint.getFontMetrics();
        canvas.drawText(text, edge / 2f, edge / 2f - (metrics.ascent + metrics.descent) / 2f, paint);
        return bitmap;
    }

    private static int colorOf(String color, String name) {
        if (color != null && color.startsWith("#") && color.length() >= 4) {
            try {
                return Color.parseColor(color);
            } catch (IllegalArgumentException ignored) {
                /* fall through to the board palette */
            }
        }
        int hash = 0;
        String value = name == null ? "" : name;
        for (int i = 0; i < value.length(); i++) hash = hash * 31 + value.charAt(i);
        return PALETTE[Math.abs(hash) % PALETTE.length];
    }

    private static boolean light(int color) {
        int luminance = (Color.red(color) * 299 + Color.green(color) * 587 + Color.blue(color) * 114) / 1000;
        return luminance > 170;
    }

    private static File cacheDir(Context context) {
        File dir = new File(context.getCacheDir(), "crests");
        if (!dir.isDirectory()) dir.mkdirs();
        return dir;
    }

    private static String key(String name, String url) {
        String raw = (url == null || url.isEmpty() ? "name:" + (name == null ? "" : name) : url).toLowerCase(Locale.US);
        return Integer.toHexString(raw.hashCode());
    }

    private static void touch(File file) {
        try {
            File parent = file.getParentFile();
            if (parent != null && !parent.isDirectory()) parent.mkdirs();
            if (!file.exists()) new FileOutputStream(file).close();
            file.setLastModified(System.currentTimeMillis());
        } catch (Exception ignored) {
            /* a missed crest still falls back to initials */
        }
    }
}

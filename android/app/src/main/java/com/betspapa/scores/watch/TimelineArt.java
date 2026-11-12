package com.betspapa.scores.watch;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import com.betspapa.watch.WatchMatch;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/** 0′–90′ pitch line with goal, card, and VAR marks. Drawn to a bitmap because RemoteViews cannot. */
final class TimelineArt {
    private TimelineArt() {}

    static Bitmap draw(List<WatchMatch.Marker> markers, int minute, boolean dark, int width, int height) {
        int safeWidth = Math.max(width, 32);
        int safeHeight = Math.max(height, 24);
        Bitmap bitmap = Bitmap.createBitmap(safeWidth, safeHeight, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        float pad = safeWidth * 0.01f;
        float trackH = Math.max(6f, safeHeight * 0.16f);
        float trackTop = safeHeight * 0.34f;
        float left = pad;
        float right = safeWidth - pad;
        float span = Math.max(1f, right - left);
        int at = Math.max(0, Math.min(90, minute));
        float progress = left + span * (at / 90f);

        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(dark ? 0xFF1F8A4C : 0xFFBFE8CF);
        canvas.drawRoundRect(new RectF(left, trackTop, right, trackTop + trackH), trackH, trackH, paint);
        paint.setColor(0xFFE11D2E);
        if (progress > left + 1f) {
            canvas.drawRoundRect(new RectF(left, trackTop, Math.max(progress, left + trackH), trackTop + trackH), trackH, trackH, paint);
            if (progress < right - trackH) {
                canvas.drawRect(progress - trackH, trackTop, progress, trackTop + trackH, paint);
            }
        }

        paint.setColor(dark ? 0xFFB0B4BE : 0xFF6B7280);
        paint.setTextSize(safeHeight * 0.22f);
        float base = safeHeight * 0.95f;
        paint.setTextAlign(Paint.Align.LEFT);
        canvas.drawText("0′", left, base, paint);
        paint.setTextAlign(Paint.Align.RIGHT);
        canvas.drawText("90′", right, base, paint);

        List<WatchMatch.Marker> ordered = new ArrayList<WatchMatch.Marker>();
        if (markers != null) ordered.addAll(markers);
        Collections.sort(ordered, new Comparator<WatchMatch.Marker>() {
            @Override
            public int compare(WatchMatch.Marker leftMark, WatchMatch.Marker rightMark) {
                return leftMark.minute - rightMark.minute;
            }
        });
        float lastLabel = -1000f;
        float cy = trackTop + trackH / 2f;
        for (WatchMatch.Marker marker : ordered) {
            float x = left + span * (Math.max(0, Math.min(90, marker.minute)) / 90f);
            String type = marker.type == null ? "" : marker.type;
            if ("yellow".equals(type) || "red".equals(type)) {
                float cardW = trackH * 0.85f;
                float cardH = trackH * 1.35f;
                paint.setColor("red".equals(type) ? 0xFFE11D2E : 0xFFF5C518);
                canvas.drawRoundRect(new RectF(x - cardW / 2f, trackTop - cardH * 0.15f, x + cardW / 2f, trackTop + cardH), 2f, 2f, paint);
            } else if ("var".equals(type)) {
                float radius = trackH * 0.95f;
                paint.setColor(0xFFF5C518);
                canvas.drawCircle(x, cy, radius, paint);
                paint.setColor(0xFF14161C);
                paint.setTextSize(radius * 0.85f);
                paint.setTextAlign(Paint.Align.CENTER);
                paint.setFakeBoldText(true);
                Paint.FontMetrics metrics = paint.getFontMetrics();
                canvas.drawText("VAR", x, cy - (metrics.ascent + metrics.descent) / 2f, paint);
                paint.setFakeBoldText(false);
            } else {
                float radius = trackH * 0.95f;
                paint.setColor(Color.WHITE);
                canvas.drawCircle(x, cy, radius, paint);
                paint.setColor(0xFF111111);
                canvas.drawCircle(x, cy, radius * 0.28f, paint);
                paint.setStyle(Paint.Style.STROKE);
                paint.setStrokeWidth(Math.max(1f, radius * 0.12f));
                canvas.drawCircle(x, cy, radius * 0.62f, paint);
                paint.setStyle(Paint.Style.FILL);
            }
            if (Math.abs(x - lastLabel) < safeWidth * 0.12f) continue;
            String abbr = marker.abbr == null ? "" : marker.abbr;
            String label = marker.minute + "′" + (abbr.isEmpty() ? "" : " " + abbr);
            paint.setColor(dark ? 0xFFE6E8EE : 0xFF3C4250);
            paint.setTextSize(safeHeight * 0.2f);
            paint.setTextAlign(Paint.Align.CENTER);
            paint.setFakeBoldText(true);
            canvas.drawText(label, x, base, paint);
            paint.setFakeBoldText(false);
            lastLabel = x;
        }
        return bitmap;
    }
}

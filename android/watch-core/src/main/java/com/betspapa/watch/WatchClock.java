package com.betspapa.watch;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

final class WatchClock {
    private static final TimeZone UTC = TimeZone.getTimeZone("UTC");

    private WatchClock() {}

    static long parseIso(String value) {
        if (value == null) return 0L;
        String text = value.trim();
        if (text.isEmpty()) return 0L;
        String[] patterns = text.contains(".")
            ? new String[] {"yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", "yyyy-MM-dd'T'HH:mm:ss.SSSXXX"}
            : new String[] {"yyyy-MM-dd'T'HH:mm:ss'Z'", "yyyy-MM-dd'T'HH:mm:ssXXX"};
        for (String pattern : patterns) {
            try {
                SimpleDateFormat format = new SimpleDateFormat(pattern, Locale.US);
                format.setLenient(false);
                format.setTimeZone(UTC);
                Date parsed = format.parse(text);
                if (parsed != null) return parsed.getTime();
            } catch (ParseException ignored) {
                /* try the next pattern */
            }
        }
        return 0L;
    }
}

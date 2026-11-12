package com.betspapa.watch;

import java.util.LinkedHashMap;
import java.util.Map;

/** The fixture and in-play URLs the app already requests. Native HTTP must not send Origin. */
public final class MatchFeeds {
    public static final String FIXTURES = "https://api.betspapa.com/api/sportybet/upcoming";
    public static final String LIVE = "https://www.sportybet.com/api/gh/factsCenter/liveOrPrematchEvents?sportId=sr%3Asport%3A1";
    public static final String USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";
    public static final String SOURCE_LABEL = "Betspapa fixtures";

    private MatchFeeds() {}

    public static Map<String, String> headers() {
        Map<String, String> headers = new LinkedHashMap<String, String>();
        headers.put("Accept", "application/json");
        headers.put("User-Agent", USER_AGENT);
        return headers;
    }
}

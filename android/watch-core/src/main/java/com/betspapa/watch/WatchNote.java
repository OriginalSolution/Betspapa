package com.betspapa.watch;

public final class WatchNote {
    public final String id;
    public final String matchId;
    public final String kind;
    public final String title;
    public final String body;

    public WatchNote(String id, String matchId, String kind, String title, String body) {
        this.id = id;
        this.matchId = matchId;
        this.kind = kind;
        this.title = title;
        this.body = body;
    }
}

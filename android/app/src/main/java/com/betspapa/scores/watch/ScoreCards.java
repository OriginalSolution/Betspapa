package com.betspapa.scores.watch;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Build;
import android.view.View;
import android.widget.RemoteViews;
import androidx.core.app.NotificationCompat;
import com.betspapa.scores.R;
import com.betspapa.watch.NoteCopy;
import com.betspapa.watch.WatchMatch;
import com.betspapa.watch.WatchNote;
import java.util.List;

/** RemoteViews for the Red Ticker (dark) and the white score panel (light). */
final class ScoreCards {
    private ScoreCards() {}

    static void attach(Context context, NotificationCompat.Builder builder, WatchNote note, WatchMatch match, boolean dark) {
        builder.setCustomContentView(collapsed(context, note, match));
        builder.setCustomBigContentView(expanded(context, note, match, dark));
        // The pop-up uses the heads-up view. Without one Android shows the one-line pill,
        // so the alert arrives looking closed. This is the scoreboard without the timeline.
        builder.setCustomHeadsUpContentView(headsUp(context, note, match, dark));
        builder.setStyle(new NotificationCompat.DecoratedCustomViewStyle());
    }

    /** Scoreboard card for the pop-up. The heads-up slot is short, so the timeline and buttons stay in the shade card. */
    static RemoteViews headsUp(Context context, WatchNote note, WatchMatch match, boolean dark) {
        RemoteViews views = expanded(context, note, match, dark);
        views.setViewVisibility(R.id.timeline, View.GONE);
        views.setViewVisibility(R.id.actions, View.GONE);
        return views;
    }

    static RemoteViews collapsed(Context context, WatchNote note, WatchMatch match) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.notif_collapsed);
        views.setFloat(R.id.collapsed_brand, "setLetterSpacing", 0.08f);
        views.setOnClickPendingIntent(R.id.notif_collapsed, OpenMatch.forNote(context, note));
        boolean trend = trend(note);
        if (trend) {
            String score = shownFixture(note, match);
            String head = strip(note, match);
            String market = market(note);
            String line = !score.isEmpty() ? head + " \u00b7 " + score : !"Pick".equals(market) ? head + " \u00b7 " + market : head;
            views.setTextViewText(R.id.collapsed_score, line);
            String clock = clockOf(note, match);
            if (clock.isEmpty()) {
                views.setViewVisibility(R.id.collapsed_dot, View.GONE);
                views.setViewVisibility(R.id.collapsed_minute, View.GONE);
            } else {
                views.setTextViewText(R.id.collapsed_minute, clock);
            }
            return views;
        }
        views.setTextViewText(R.id.collapsed_score, compactScore(note, match));
        String minute = collapsedMinute(note, match);
        if (minute.isEmpty()) {
            views.setViewVisibility(R.id.collapsed_dot, View.GONE);
            views.setViewVisibility(R.id.collapsed_minute, View.GONE);
        } else {
            views.setTextViewText(R.id.collapsed_minute, minute);
        }
        return views;
    }

    static RemoteViews expanded(Context context, WatchNote note, WatchMatch match, boolean dark) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.notif_expanded);
        views.setFloat(R.id.strip_brand, "setLetterSpacing", 0.08f);
        int panel = dark ? R.drawable.notif_panel_dark : R.drawable.notif_panel_light;
        int text = dark ? 0xFFFFFFFF : 0xFF14161C;
        int muted = dark ? 0xFFA7ACB8 : 0xFF5E6573;
        int secondary = dark ? R.drawable.notif_btn_secondary_dark : R.drawable.notif_btn_secondary_light;
        views.setInt(R.id.panel, "setBackgroundResource", panel);
        PendingIntent open = OpenMatch.forNote(context, note);
        views.setOnClickPendingIntent(R.id.card_root, open);
        views.setOnClickPendingIntent(R.id.strip, open);
        views.setOnClickPendingIntent(R.id.panel, open);
        views.setTextViewText(R.id.strip_status, strip(note, match));
        if (trend(note)) views.setViewVisibility(R.id.strip_dot, View.GONE);

        boolean showTrend = trend(note);
        // No match on the phone: show the alert text, never an empty Home / Away board.
        boolean board = !showTrend && match != null;
        views.setViewVisibility(R.id.line_compact, board && dark ? View.VISIBLE : View.GONE);
        views.setViewVisibility(R.id.line_board, board && !dark ? View.VISIBLE : View.GONE);
        views.setViewVisibility(R.id.trend_block, showTrend ? View.VISIBLE : View.GONE);
        views.setViewVisibility(R.id.timeline, board ? View.VISIBLE : View.GONE);
        views.setViewVisibility(R.id.competition, board && competition(match).length() > 0 && !goalish(note) ? View.VISIBLE : View.GONE);
        if (!showTrend && match == null) {
            views.setViewVisibility(R.id.trend_block, View.VISIBLE);
            views.setViewVisibility(R.id.book_row, View.GONE);
            views.setTextViewText(R.id.trend_market, note == null || note.title == null ? "Betspapa" : note.title);
            views.setTextColor(R.id.trend_market, text);
            views.setTextViewText(R.id.trend_fixture, note == null || note.body == null ? "" : note.body);
            views.setTextColor(R.id.trend_fixture, muted);
        }

        if (board && dark) {
            views.setTextViewText(R.id.score_line, compactScore(note, match));
            views.setTextColor(R.id.score_line, text);
            views.setImageViewBitmap(R.id.crest_home, crest(context, match, true, dp(context, 22)));
            views.setImageViewBitmap(R.id.crest_away, crest(context, match, false, dp(context, 22)));
        }
        if (board && !dark) {
            views.setTextViewText(R.id.name_home, name(match, true));
            views.setTextViewText(R.id.name_away, name(match, false));
            views.setTextColor(R.id.name_home, text);
            views.setTextColor(R.id.name_away, text);
            views.setTextViewText(R.id.score_big, bigScore(match));
            views.setTextColor(R.id.score_big, text);
            views.setImageViewBitmap(R.id.crest_home_lg, crest(context, match, true, context.getResources().getDimensionPixelSize(R.dimen.notif_crest_lg)));
            views.setImageViewBitmap(R.id.crest_away_lg, crest(context, match, false, context.getResources().getDimensionPixelSize(R.dimen.notif_crest_lg)));
        }
        String scorer = scorer(note, match);
        boolean chip = note.varCheck || note.disallowed;
        if (scorer.isEmpty() && !chip) {
            views.setViewVisibility(R.id.scorer_row, View.GONE);
        } else {
            views.setViewVisibility(R.id.scorer_row, View.VISIBLE);
            views.setTextViewText(R.id.scorer, scorer);
            views.setTextColor(R.id.scorer, text);
            if (note.disallowed) {
                views.setViewVisibility(R.id.var_chip, View.VISIBLE);
                views.setTextViewText(R.id.var_chip, "DISALLOWED");
                views.setInt(R.id.var_chip, "setBackgroundResource", R.drawable.notif_chip_no);
                views.setTextColor(R.id.var_chip, 0xFFFFFFFF);
            } else if (note.varCheck) {
                views.setViewVisibility(R.id.var_chip, View.VISIBLE);
                views.setTextViewText(R.id.var_chip, "VAR CHECK");
                views.setInt(R.id.var_chip, "setBackgroundResource", R.drawable.notif_chip_var);
                views.setTextColor(R.id.var_chip, 0xFF14161C);
            } else {
                views.setViewVisibility(R.id.var_chip, View.GONE);
            }
        }
        views.setTextViewText(R.id.competition, competition(match));
        views.setTextColor(R.id.competition, muted);
        if (board) {
            // Fold cover screens are about 300dp of shade. The image scales to the slot either way.
            int width = Math.max(dp(context, 200), context.getResources().getDisplayMetrics().widthPixels - dp(context, 48));
            List<WatchMatch.Marker> markers = match == null ? null : match.markers;
            views.setImageViewBitmap(R.id.timeline, TimelineArt.draw(markers, minute(note, match), dark, width, dp(context, 40)));
        }
        if (showTrend) {
            boolean named = namedMatch(match);
            if (named) {
                views.setViewVisibility(R.id.line_compact, View.VISIBLE);
                String score = withClock(shownFixture(note, match), clockOf(note, match));
                views.setTextViewText(R.id.score_line, score);
                views.setTextColor(R.id.score_line, text);
                paintCrest(views, R.id.crest_home, crestPhoto(context, match, true, dp(context, 22)));
                paintCrest(views, R.id.crest_away, crestPhoto(context, match, false, dp(context, 22)));
            }
            views.setTextViewText(R.id.trend_market, market(note));
            views.setTextColor(R.id.trend_market, text);
            String fixtureLine = named ? "" : withClock(shownFixture(note, match), clockOf(note, match));
            views.setTextViewText(R.id.trend_fixture, fixtureLine);
            views.setTextColor(R.id.trend_fixture, muted);
            views.setViewVisibility(R.id.trend_fixture, fixtureLine.isEmpty() ? View.GONE : View.VISIBLE);
            String detail = detailLine(note);
            views.setTextViewText(R.id.trend_detail, detail);
            views.setTextColor(R.id.trend_detail, muted);
            views.setViewVisibility(R.id.trend_detail, detail.isEmpty() ? View.GONE : View.VISIBLE);
            boolean booked = note.bookCode != null && !note.bookCode.isEmpty();
            // The code is named in the detail line. SportyBet is not shown as the source of the price.
            boolean showBrand = booked && note.bookId != null && !note.bookId.isEmpty() && !"sportybet".equals(note.bookId);
            views.setViewVisibility(R.id.book_row, showBrand ? View.VISIBLE : View.GONE);
            if (booked) {
                views.setTextViewText(R.id.book_name, bookName(note.bookId));
                views.setTextColor(R.id.book_name, bookText(note.bookId));
                views.setTextColor(R.id.book_code, text);
                views.setTextViewText(R.id.book_code, note.bookCode);
                views.setFloat(R.id.book_code, "setLetterSpacing", 0.04f);
                views.setInt(R.id.book_chip, "setBackgroundResource", bookBackground(note.bookId));
                int logo = bookLogo(note.bookId);
                if (logo == 0) views.setViewVisibility(R.id.book_logo, View.GONE);
                else views.setImageViewResource(R.id.book_logo, logo);
            }
        }

        views.setInt(R.id.action_secondary, "setBackgroundResource", secondary);
        views.setInt(R.id.action_tertiary, "setBackgroundResource", secondary);
        views.setTextColor(R.id.action_secondary, text);
        views.setTextColor(R.id.action_tertiary, text);
        if (showTrend && note.bookCode != null && !note.bookCode.isEmpty()) {
            views.setTextViewText(R.id.action_primary, "Copy code");
            views.setTextViewText(R.id.action_secondary, "Open");
            views.setViewVisibility(R.id.action_tertiary, View.GONE);
            views.setOnClickPendingIntent(R.id.action_primary, copyCode(context, note.bookCode));
            views.setOnClickPendingIntent(R.id.action_secondary, open);
        } else if (showTrend) {
            views.setTextViewText(R.id.action_primary, "Open");
            views.setViewVisibility(R.id.action_secondary, View.GONE);
            views.setViewVisibility(R.id.action_tertiary, View.GONE);
            views.setOnClickPendingIntent(R.id.action_primary, open);
        } else {
            views.setTextViewText(R.id.action_primary, context.getString(R.string.notif_action_primary));
            // "Mute match" on regular phones, "Mute" under 380dp so it never wraps on a Fold cover.
            views.setTextViewText(R.id.action_secondary, context.getString(R.string.notif_action_secondary));
            views.setTextViewText(R.id.action_tertiary, context.getString(R.string.notif_action_tertiary));
            views.setOnClickPendingIntent(R.id.action_primary, open);
            boolean muteable = note.matchId != null && !note.matchId.isEmpty() && match != null;
            views.setViewVisibility(R.id.action_secondary, muteable ? View.VISIBLE : View.GONE);
            if (muteable) views.setOnClickPendingIntent(R.id.action_secondary, mute(context, note.matchId));
            views.setOnClickPendingIntent(R.id.action_tertiary, share(context, note, match));
        }
        return views;
    }

    private static boolean trend(WatchNote note) {
        return note != null && ("win".equals(note.kind) || "bust".equals(note.kind) || "slip".equals(note.kind));
    }

    private static boolean goalish(WatchNote note) {
        return note != null && ("goal".equals(note.kind) || "var".equals(note.kind) || note.varCheck || note.disallowed);
    }

    private static String strip(WatchNote note, WatchMatch match) {
        if (note != null && note.disallowed) return "NO GOAL";
        boolean leg = note != null && note.id != null && note.id.startsWith("slipleg:");
        if (leg && "win".equals(note.kind)) return "LEG WON";
        if (leg && "bust".equals(note.kind)) return "LEG LOST";
        if (note != null && "win".equals(note.kind)) return "TREND HIT";
        if (note != null && "bust".equals(note.kind)) return "BUST";
        if (note != null && "slip".equals(note.kind)) {
            String title = note.title == null ? "" : note.title.toLowerCase();
            return title.contains("lost") ? "SLIP LOST" : "SLIP WON";
        }
        if (note != null && "lineup".equals(note.kind)) return "LINEUPS";
        int at = minute(note, match);
        String mark = at < 0 ? "" : at + "′";
        if (goalish(note)) return mark.isEmpty() ? "GOAL" : "GOAL " + mark;
        if (note != null && "kickoff".equals(note.kind)) return "KICK-OFF";
        if (note != null && "ht".equals(note.kind)) return "HALF-TIME";
        if (note != null && "ft".equals(note.kind)) return "FULL-TIME";
        if (note != null && "red".equals(note.kind)) return "RED CARD";
        if (note != null && "penalty".equals(note.kind)) return "PENALTY";
        if (match != null && "halftime".equals(match.status)) return "HALF-TIME";
        if (match != null && "finished".equals(match.status)) return "FULL-TIME";
        return mark.isEmpty() ? "LIVE" : "LIVE " + mark;
    }

    private static String compactScore(WatchNote note, WatchMatch match) {
        if (match == null) return note == null || note.body == null ? "" : note.body;
        int home = match.homeScore == null ? 0 : match.homeScore;
        int away = match.awayScore == null ? 0 : match.awayScore;
        return NoteCopy.home(match) + " " + home + "\u2013" + away + " " + NoteCopy.away(match);
    }

    private static String bigScore(WatchMatch match) {
        int home = match == null || match.homeScore == null ? 0 : match.homeScore;
        int away = match == null || match.awayScore == null ? 0 : match.awayScore;
        return home + " \u2013 " + away;
    }

    private static String collapsedMinute(WatchNote note, WatchMatch match) {
        if (note != null && ("ht".equals(note.kind) || (match != null && "halftime".equals(match.status) && !"goal".equals(note.kind) && !"var".equals(note.kind)))) {
            return "HT";
        }
        if (note != null && "ft".equals(note.kind)) return "FT";
        int at = minute(note, match);
        return at < 0 ? "" : at + "′";
    }

    private static int minute(WatchNote note, WatchMatch match) {
        if (note != null && note.minute != null) return note.minute;
        if (match != null && match.minute != null) return match.minute;
        return -1;
    }

    private static String scorer(WatchNote note, WatchMatch match) {
        if (note != null && !"live".equals(note.kind) && note.player != null && !note.player.isEmpty()) {
            return note.minute == null ? note.player : note.player + " " + note.minute + "′";
        }
        WatchMatch.Marker latest = null;
        if (match != null) {
            for (WatchMatch.Marker marker : match.markers) {
                if (!"goal".equals(marker.type)) continue;
                if (latest == null || marker.minute > latest.minute || (marker.minute == latest.minute && marker.index >= latest.index)) {
                    latest = marker;
                }
            }
        }
        if (latest == null) return "";
        if (latest.player != null && !latest.player.isEmpty()) return latest.player + " " + latest.minute + "′";
        String team = NoteCopy.team(match, latest.side);
        if (team.isEmpty()) team = latest.abbr == null ? "" : latest.abbr;
        return team.isEmpty() ? latest.minute + "′" : latest.minute + "′ " + team;
    }

    private static String name(WatchMatch match, boolean home) {
        if (match == null) return "";
        return home ? match.fullHome() : match.fullAway();
    }

    private static String competition(WatchMatch match) {
        return match == null || match.competition == null ? "" : match.competition;
    }

    private static String market(WatchNote note) {
        String fromLabel = useful(note == null ? null : note.marketLabel);
        if (fromLabel != null) return headline(tier(fromLabel));
        String fromTitle = afterMark(note == null ? null : note.title);
        if (fromTitle != null) return headline(tier(fromTitle));
        String fromBody = firstPiece(note == null ? null : note.body);
        if (fromBody != null) return headline(tier(fromBody));
        return "Settled";
    }

    /** The notification's plain text. Never only the words "Trend hit". */
    static String plainText(WatchNote note, WatchMatch match) {
        if (note == null) return "";
        if (!trend(note)) {
            String body = note.body == null ? "" : note.body;
            return body.equalsIgnoreCase("Trend hit") ? "Pick settled" : body;
        }
        String score = withClock(shownFixture(note, match), clockOf(note, match));
        String pick = market(note);
        String detail = detailLine(note);
        StringBuilder built = new StringBuilder();
        if (!score.isEmpty()) built.append(score);
        if (!"Settled".equals(pick) && (built.length() == 0 || built.indexOf(pick) < 0)) {
            if (built.length() > 0) built.append(" \u00b7 ");
            built.append(pick);
        }
        if (!detail.isEmpty() && built.indexOf(detail) < 0) {
            if (built.length() > 0) built.append(" \u00b7 ");
            built.append(detail);
        }
        String text = tier(built.toString());
        if (text.isEmpty() || text.equalsIgnoreCase("Trend hit")) return "Pick settled";
        return text;
    }

    /** Play builds say 10/10, 9/10+ and 8/10+. The web build keeps the percent. */
    static String tier(String text) {
        return tier(text, com.betspapa.scores.BuildConfig.PLAY_STORE);
    }

    static String tier(String text, boolean play) {
        if (text == null || text.isEmpty() || !play) return text == null ? "" : text;
        return text.replace("90%+", "9/10+").replace("80%+", "8/10+").replace("100%", "10/10");
    }

    private static String useful(String value) {
        if (value == null) return null;
        String text = value.trim();
        if (text.isEmpty() || text.equalsIgnoreCase("Trend hit")) return null;
        return text;
    }

    private static String afterMark(String title) {
        if (title == null) return null;
        int cut = Math.max(title.indexOf('\u00b7'), title.indexOf('·'));
        if (cut < 0 || cut + 1 >= title.length()) return null;
        return useful(title.substring(cut + 1));
    }

    private static boolean namedMatch(WatchMatch match) {
        if (match == null) return false;
        String home = NoteCopy.home(match);
        String away = NoteCopy.away(match);
        return !home.isEmpty() && !away.isEmpty() && !"Home team".equals(home) && !"Away team".equals(away);
    }

    private static String shownFixture(WatchNote note, WatchMatch match) {
        if (namedMatch(match) && match.homeScore != null && match.awayScore != null) {
            return NoteCopy.home(match) + " " + match.homeScore + "-" + match.awayScore + " " + NoteCopy.away(match);
        }
        String written = useful(note == null ? null : note.fixture);
        if (written != null) return tier(written);
        if (namedMatch(match)) return NoteCopy.fixture(match);
        String body = useful(note == null ? null : note.body);
        return body == null ? "" : tier(body);
    }

    private static String clockOf(WatchNote note, WatchMatch match) {
        String written = useful(note == null ? null : note.clock);
        if (written != null) return written;
        if (match != null && "finished".equals(match.status)) return "FT";
        if (match != null && "halftime".equals(match.status)) return "HT";
        int at = minute(note, match);
        return at < 0 ? "" : at + "\u2032";
    }

    private static String withClock(String score, String clock) {
        if (score.isEmpty()) return clock == null ? "" : clock;
        if (clock == null || clock.isEmpty() || score.contains(clock)) return score;
        return score + " " + clock;
    }

    private static String detailLine(WatchNote note) {
        if (note == null) return "";
        String market = market(note);
        StringBuilder built = new StringBuilder();
        appendDetail(built, tier(useful(note.trendLabel)), market);
        appendDetail(built, useful(note.oddsText), market);
        String slip = useful(note.slipLabel);
        appendDetail(built, tier(slip), market);
        String code = useful(note.bookCode);
        if (code != null && (slip == null || !slip.equalsIgnoreCase(code))) appendDetail(built, code, market);
        appendDetail(built, useful(note.progress), market);
        if (built.length() == 0) appendLeftover(built, note.body, market);
        return built.toString();
    }

    /** Pieces of a rich body that are not the score line or the pick, when the structured fields were empty. */
    private static void appendLeftover(StringBuilder built, String body, String market) {
        if (body == null) return;
        for (String piece : body.split("\u00b7|·")) {
            String text = useful(piece);
            if (text == null) continue;
            if (text.matches(".*\\d+\\s*-\\s*\\d+.*")) continue;
            appendDetail(built, tier(text), market);
        }
    }

    private static String firstPiece(String body) {
        if (body == null) return null;
        for (String piece : body.split("\u00b7|·")) {
            String text = useful(piece);
            if (text == null || text.matches(".*\\d+\\s*-\\s*\\d+.*")) continue;
            if (text.matches("(?i)\\d+(\\.\\d+)?") || text.matches("(?i)\\d+ of \\d+ won")) continue;
            if ("FT".equals(text) || "HT".equals(text) || text.endsWith("\u2032")) continue;
            return text;
        }
        return null;
    }

    private static void appendDetail(StringBuilder built, String part, String market) {
        if (part == null || part.isEmpty() || part.equalsIgnoreCase(market)) return;
        if (built.length() > 0) built.append(" \u00b7 ");
        built.append(part);
    }

    private static String headline(String label) {
        String[] parts = label.split(" ");
        StringBuilder built = new StringBuilder();
        for (String part : parts) {
            if (part.isEmpty()) continue;
            if (built.length() > 0) built.append(' ');
            built.append(Character.toUpperCase(part.charAt(0)));
            if (part.length() > 1) built.append(part.substring(1));
        }
        return built.toString();
    }

    private static String fixture(WatchNote note, WatchMatch match) {
        String line = note != null && note.fixture != null && !note.fixture.isEmpty()
            ? note.fixture
            : match == null ? "" : NoteCopy.fixture(match);
        if (note != null && note.oddsText != null && !note.oddsText.isEmpty()) line = line + " " + note.oddsText;
        return line;
    }

    /** A stored badge, or null. A missing crest stays blank. It is never an initials circle. */
    private static Bitmap crestPhoto(Context context, WatchMatch match, boolean home, int size) {
        if (match == null) return null;
        String full = home ? match.fullHome() : match.fullAway();
        String url = home ? match.homeCrest : match.awayCrest;
        try {
            return CrestCache.photo(context, full, url, size);
        } catch (RuntimeException error) {
            return null;
        }
    }

    private static void paintCrest(RemoteViews views, int id, Bitmap badge) {
        if (badge == null) {
            views.setViewVisibility(id, View.GONE);
            return;
        }
        views.setViewVisibility(id, View.VISIBLE);
        views.setImageViewBitmap(id, badge);
    }

    private static Bitmap crest(Context context, WatchMatch match, boolean home, int size) {
        if (match == null) return CrestCache.initials("TM", "", "", size);
        String full = home ? match.fullHome() : match.fullAway();
        String abbr = home ? match.abbrHome() : match.abbrAway();
        String color = home ? match.homeColor : match.awayColor;
        String url = home ? match.homeCrest : match.awayCrest;
        try {
            return CrestCache.badge(context, full, url, abbr, color, size);
        } catch (RuntimeException error) {
            return CrestCache.initials(abbr, color, full, size);
        }
    }

    private static int bookBackground(String id) {
        if ("footballcom".equals(id)) return R.drawable.notif_chip_footballcom;
        if ("msport".equals(id)) return R.drawable.notif_chip_msport;
        if ("betika".equals(id)) return R.drawable.notif_chip_betika;
        if ("betpawa".equals(id)) return R.drawable.notif_chip_betpawa;
        return R.drawable.notif_chip_sportybet;
    }

    private static int bookText(String id) {
        if ("betika".equals(id)) return 0xFF203080;
        if ("msport".equals(id)) return 0xFFF0C020;
        if ("betpawa".equals(id)) return 0xFF90E000;
        if ("footballcom".equals(id)) return 0xFF9AF01A;
        return 0xFFFFFFFF;
    }

    private static int bookLogo(String id) {
        if ("sportybet".equals(id)) return R.drawable.book_sportybet;
        if ("footballcom".equals(id)) return R.drawable.book_footballcom;
        if ("msport".equals(id)) return R.drawable.book_msport;
        if ("betika".equals(id)) return R.drawable.book_betika;
        if ("betpawa".equals(id)) return R.drawable.book_betpawa;
        return 0;
    }

    static String bookName(String id) {
        if ("sportybet".equals(id)) return "SportyBet";
        if ("footballcom".equals(id)) return "Football.com";
        if ("msport".equals(id)) return "MSport";
        if ("betika".equals(id)) return "Betika";
        if ("betpawa".equals(id)) return "BetPawa";
        return "Booked";
    }

    private static PendingIntent mute(Context context, String matchId) {
        return actionActivity(context, NotificationActionReceiver.ACTION_MUTE, "mute:" + matchId, matchId, null);
    }

    private static PendingIntent copyCode(Context context, String code) {
        return actionActivity(context, NotificationActionReceiver.ACTION_COPY, "copy:" + code, null, code);
    }

    /** The activity shows the toast. The receiver still copies or mutes. */
    private static PendingIntent actionActivity(Context context, String action, String key, String matchId, String code) {
        Intent intent = new Intent(context, NotifToastActivity.class);
        intent.setAction(action);
        if (matchId != null) intent.putExtra(NotificationActionReceiver.EXTRA_MATCH, matchId);
        if (code != null) intent.putExtra(NotificationActionReceiver.EXTRA_CODE, code);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_ANIMATION);
        return PendingIntent.getActivity(context, request(key), intent, immutable());
    }

    private static PendingIntent share(Context context, WatchNote note, WatchMatch match) {
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");
        send.putExtra(Intent.EXTRA_TEXT, shareText(note, match));
        Intent chooser = Intent.createChooser(send, "Share score");
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(context, request("share:" + (note == null ? "" : note.id)), chooser, immutable());
    }

    static String shareText(WatchNote note, WatchMatch match) {
        String home = NoteCopy.home(match);
        String away = NoteCopy.away(match);
        int homeScore = match == null || match.homeScore == null ? 0 : match.homeScore;
        int awayScore = match == null || match.awayScore == null ? 0 : match.awayScore;
        String text = home + " " + homeScore + "\u2013" + awayScore + " " + away;
        if (match != null && match.competition != null && !match.competition.isEmpty()) text += "\n" + match.competition;
        int at = minute(note, match);
        if (at >= 0) text += "\n" + at + "′";
        return text + "\nBetspapa";
    }

    private static int request(String key) {
        return com.betspapa.watch.AlertPlanner.notificationId(key == null ? "card" : key);
    }

    private static int immutable() {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        return flags;
    }

    private static int dp(Context context, int value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }
}

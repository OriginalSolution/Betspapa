package com.betspapa.scores.watch;

import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Mirrors juniorSide() in src/lib/crestMatch.mjs. "Birmingham U21" belongs to "birmingham".
 * Youth and reserve sides wear the senior crest; a women's side only borrows it when it has none.
 */
final class JuniorSide {
    static final String YOUTH = "youth";
    static final String RESERVE = "reserve";
    static final String WOMEN = "women";

    private static final Pattern AGE = Pattern.compile("\\b(?:u|under|sub)\\s*-?\\s*(1[5-9]|2[0-3])\\b");
    private static final Pattern RESERVE_WORDS = Pattern.compile("\\b(reserves|reserve|youth|juvenil|juniors|academy|castilla|promesas|atletic)\\b");
    private static final Pattern JONG = Pattern.compile("^jong\\s+(?=\\S)");
    private static final Pattern SECOND = Pattern.compile("\\s+(ii|iii|b)$");
    private static final Pattern WOMENS = Pattern.compile("\\b(women|ladies|femenino|feminino|feminine|femeni|feminas|femenil|frauen|dames|kvinde|female|girls|wfc)\\b");
    private static final Pattern W_SUFFIX = Pattern.compile("\\s+w$");

    final String senior;
    final String kind;

    private JuniorSide(String senior, String kind) {
        this.senior = senior;
        this.kind = kind;
    }

    static String fold(String value) {
        if (value == null) return "";
        String plain = Normalizer.normalize(value, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        return plain.toLowerCase(Locale.US).replace("&", " and ").replaceAll("[^a-z0-9]+", " ").trim().replaceAll("\\s+", " ");
    }

    static JuniorSide of(String name) {
        String folded = fold(name);
        if (folded.isEmpty()) return null;
        String kind = "";
        String senior = folded;
        if (AGE.matcher(senior).find()) {
            kind = YOUTH;
            senior = AGE.matcher(senior).replaceAll(" ");
        }
        if (RESERVE_WORDS.matcher(senior).find()) {
            if (kind.isEmpty()) kind = RESERVE;
            senior = RESERVE_WORDS.matcher(senior).replaceAll(" ");
        }
        if (JONG.matcher(senior).find()) {
            if (kind.isEmpty()) kind = RESERVE;
            senior = JONG.matcher(senior).replaceFirst(" ");
        }
        senior = senior.trim().replaceAll("\\s+", " ");
        if (SECOND.matcher(" " + senior).find() && senior.contains(" ")) {
            if (kind.isEmpty()) kind = RESERVE;
            senior = SECOND.matcher(senior).replaceAll(" ");
        }
        if (WOMENS.matcher(senior).find() || W_SUFFIX.matcher(senior).find()) {
            if (kind.isEmpty()) kind = WOMEN;
            senior = W_SUFFIX.matcher(WOMENS.matcher(senior).replaceAll(" ")).replaceAll(" ");
        }
        senior = senior.trim().replaceAll("\\s+", " ");
        if (kind.isEmpty() || senior.isEmpty() || senior.equals(folded)) return null;
        if (senior.replaceAll("\\b(fc|sc|cf|afc)\\b", "").trim().length() < 2) return null;
        return new JuniorSide(senior, kind);
    }
}

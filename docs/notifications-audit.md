# Notification audit, 21 Nov 2026 (0.4.11)

The owner reported buggy notifications. This is what the end-to-end audit found and what changed. Server changes go live when this is merged (Render auto-deploys `main`). Phone changes ship in 0.4.11 (versionCode 34).

## What was wrong

### Server (`server/push.mjs`)

1. **Full time never fired, and full-time trends never settled.** SportyBet's in-play list (`liveOrPrematchEvents`) only ever lists H1, HT and H2 rows. A finished match just disappears, so `status: finished` was never seen. That meant no Full-time push, and no push for followed trends that settle at full time: home, away and draw wins, double chance, draw no bet, unders, clean sheet and both-teams-not-to-score. Checked live on 21 Nov: four matches left the list at 90:00, and their event rows said `matchStatus: "Ended"`, `status: 3`.
2. **Late "Kick-off" cards.** A live match that wasn't in the stored baseline was announced as a kick-off whatever its minute (for example 63′). That happened after a feed gap or a restart.
3. **"Half-time" at full time.** A match going straight from H2 to finished raised both Half-time and Full-time.
4. **VAR-cancelled goals.** A score that went down was ignored. No "disallowed" card was sent, and the goal's id was already marked sent, so the re-scored goal (`…:goal:home:1` again) was swallowed and never alerted.
5. **Lost goals on feed gaps.** A match missing from one poll was dropped from the baseline. When it came back, its goals had nothing to diff against.
6. **Stale replays.** After a long feed outage, or a restart with an old `push-baseline.json`, the next poll replayed every goal since then.
7. **One-hour TTL for everything.** A goal could arrive 59 minutes late, after the match had ended.
8. **Dead tokens kept failing.** Only 404/410 removed a token. `400 INVALID_ARGUMENT` (bad token) and `403 SENDER_ID_MISMATCH` failed again on every alert.
9. **Transient FCM errors lost the alert.** A 429 or 5xx was logged and the alert was never retried.
10. **Red card and penalty ids differed from the phone's** (the phone adds the player), so FCM and the phone's own watcher could both post the same card.

### Phone (Android)

11. **Duplicate cheers.** The FCM service, the native poller and the WebView's `present` each checked "already sent" on their own and marked it only after posting. A push and a poll landing together both posted (same card id, but the sound and heads-up played twice). `present` didn't check at all.
12. **Token refresh waited for the app.** `onNewToken` only saved the new token. The server kept pushing to the dead one until the user next opened the app.
13. **Late cards after Doze.** A data message delivered late, or a poll after a long sleep, posted every goal from the last hour at once.
14. **Full time 130 minutes after kick-off.** The phone's own watcher marked a vanished match finished only at kick-off + 130 minutes. That made Full-time and full-time trend cards about 25 minutes late.
15. **Half-time at 45′ and at full time.** The phone's watcher raised Half-time at minute 45 while stoppage time was still being played, and at full time if it had missed the break.
16. **A lagging fixture list could lower a live score.** Combined with fix 4, that would have looked like a disallowed goal.
17. **Tap reopened the match.** After a warm tap, the open target stayed pending, so the next re-mount navigated to the same match again (an extra back-stack entry).
18. **Android 15 dataSync timeout.** `ScoreWatchService` falls back to `dataSync` but had no `onTimeout`, which crashes the app after six hours on Android 15.

## What changed

- Server: a vanished match is carried for up to 12 minutes. A followed match that leaves the list at 80′ or later is checked once a minute against SportyBet's event row, and `Ended` raises Full-time and settles trends (2, 1, 5). A kick-off is announced only up to 5′ (2). Half-time fires only on the break (3). A score drop sends a silent "Goal disallowed" card that replaces the goal card, and bumps the goal's revision (`…:goal:home:1:r1`) so the re-scored goal alerts (4). A baseline older than 8 minutes is re-seeded silently (6). TTL is 15 minutes for live events, 30 for full time, and 60 for trend hits. Every message carries `sentAt` (7). Dead tokens are dropped and 429/5xx are retried up to 3 times within 5 minutes (8, 9). Incident ids match the phone (10). `POST /api/devices` accepts `previousToken` and swaps it for the new token, keeping its sent ids.
- Phone: one `AlertGate` claim covers every path (11). A rotated token is re-registered natively from the last registration the app stashed (12). Live cards older than 15 minutes (FCM's own send time), full time older than 30, and trend hits older than 60 are kept in Alerts but don't ring. The same applies to a poll after more than 15 minutes asleep (13). A followed match that vanishes at 80′ or later is checked against the event row (14). Half-time fires only on the break (15). The fixture list can't lower a live score (16). A warm tap is not kept pending (17). `onTimeout` stops the service cleanly and the watchdog restarts it (18). The app re-sends an unchanged registration at most every 10 minutes instead of on every live tick.

Unchanged and still correct: data-only high-priority FCM (no `notification` block), so the Red Ticker card is drawn by the app even when killed. The sound channels (`betspapa.goal.<sound>.v4`, red, VAR, penalty, off), POST_NOTIFICATIONS onboarding, battery and autostart guides, and tap-to-open (`OpenMatch`, `pendingOpen`) also stay as they were.

## Tests

`npm test` (server diff, carry, finish-from-event, retry, outage, token swap, TTL). `./gradlew :watch-core:test` (disallowed and re-scored goal, half-time, fixture-list guard, ended event). `./gradlew :app:testReleaseUnitTest` (`AlertGateTest`: one poster per id, disallowed card replaces the goal card on the silent channel, token re-registration body).

The Render logs from 14–21 Nov show no FCM send errors. Sends succeeded on 17–18 Nov, and the feed timeouts on 15 Nov stopped after the IPv4 fallback. Since then, "Followed matches among them 0" means the 4 registered phones had nothing followed in play.

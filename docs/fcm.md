# Push alerts (FCM)

HiOS kills `ScoreWatchService`. 0.4.3 sends data-only FCM messages (`android.priority` HIGH, no `notification` block) so `BetspapaFirebaseService` builds the Red Ticker itself. A notification block made Android draw a plain card and never ran the app. The payload carries the event id, kind, teams, score, minute, crest URLs, and trend fields. The phone poller stays as a fallback and skips a note id the push already marked sent. Goal, kick-off, trend, red card, VAR, and penalty use the same sound channels as the on-phone cards.

`android/app/google-services.json` is the Firebase Android config for `com.betspapa.scores` in project `betspapa-app`. The Gradle build applies the Google services plugin and the messaging SDK because that file is present. The app reads the FCM token and posts it, with follows, followed trends, and prices, to `POST /api/devices`.

The server sends goal, kick-off, and followed-trend alerts through FCM HTTP v1 when a service account is set. Messages stay data-only and high priority. TTL is 15 minutes for goals, VAR, cards, kick-off and half-time, 30 minutes for full time, and an hour for trend hits and promos. Each message carries `sentAt`. The phone also uses FCM's send time, and a live card that arrives more than 15 minutes late goes to Alerts without ringing. The last scoreboard is stored in `push-baseline.json` next to `devices.json`, so a process restart still diffs the next poll instead of treating it as the first look. A baseline older than 8 minutes is re-seeded without alerts. A match missing from the in-play list is carried for 12 minutes. A followed match that leaves the list at 80′ or later is checked against SportyBet's event row, and `Ended` raises Full-time and settles full-time trends. The in-play list never shows finished matches. A score that goes down sends a silent "Goal disallowed" card (`…:cancelled`, with `replaces` set to the goal id) and the re-scored goal gets a revision id (`…:r1`). See [notifications-audit.md](./notifications-audit.md). Use one of:

- `FCM_SERVICE_ACCOUNT_JSON` — the raw JSON
- `FCM_SERVICE_ACCOUNT` — path to the file
- `GOOGLE_APPLICATION_CREDENTIALS` — path to the file

The JSON must include `project_id`, `client_email`, and `private_key`. Do not commit it. `GET /api/health` reports `push: true` when those fields are loaded. It does not return the key.

`POST /api/devices/test` with `{ "token" }` or `{ "latest": true }` sends one data-only test message. Optional `kind` is `goal`, `kickoff`, `win`, `red`, `var`, or `penalty`, and optional `matchId` is what a tap opens. The process log records the FCM response (`name`, or the error status and message). The log never includes the service-account key or the access token.

A price under 1.20 is not pushed. Simulated, virtual, and SRL matches are not pushed.

The website can show a notification only while the tab is open and the browser permission is granted. There is no Web Push subscription: Firebase has no web app for this project, and the service worker does not handle a `push` event. Closing the tab stops web alerts. Android alerts do not depend on that tab.

`POST /api/devices` accepts `previousToken`. The phone sends it from `onNewToken` with its last registration, so a rotated token replaces the old one even while the app is closed. FCM `404`, `400` with an invalid-token message, and `403 SENDER_ID_MISMATCH` remove the token. `429` and `5xx` are retried up to 3 times within 5 minutes.

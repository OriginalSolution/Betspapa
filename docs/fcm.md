# Push alerts (FCM)

HiOS kills `ScoreWatchService`. 0.4.3 sends data-only FCM messages (`android.priority` HIGH, no `notification` block) so `BetspapaFirebaseService` builds the Red Ticker itself. A notification block made Android draw a plain card and never ran the app. The payload carries the event id, kind, teams, score, minute, crest URLs, and trend fields. The phone poller stays as a fallback and skips a note id the push already marked sent. Goal, kick-off, trend, red card, VAR, and penalty use the same sound channels as the on-phone cards.

`android/app/google-services.json` is the Firebase Android config for `com.betspapa.scores` in project `betspapa-app`. The Gradle build applies the Google services plugin and the messaging SDK because that file is present. The app reads the FCM token and posts it, with follows, followed trends, and prices, to `POST /api/devices`.

The server sends goal, kick-off, and followed-trend alerts through FCM HTTP v1 when a service account is set. Messages stay data-only and high priority, and they live for an hour (`ttl` `3600s`) so a phone that wakes late still receives them. The last scoreboard is stored in `push-baseline.json` next to `devices.json`, so a process restart still diffs the next poll instead of treating it as the first look. Use one of:

- `FCM_SERVICE_ACCOUNT_JSON` — the raw JSON
- `FCM_SERVICE_ACCOUNT` — path to the file
- `GOOGLE_APPLICATION_CREDENTIALS` — path to the file

The JSON must include `project_id`, `client_email`, and `private_key`. Do not commit it. `GET /api/health` reports `push: true` when those fields are loaded. It does not return the key.

`POST /api/devices/test` with `{ "token" }` or `{ "latest": true }` sends one data-only test message. Optional `kind` is `goal`, `kickoff`, `win`, `red`, `var`, or `penalty`, and optional `matchId` is what a tap opens. The process log records the FCM response (`name`, or the error status and message). The log never includes the service-account key or the access token.

A price under 1.20 is not pushed. Simulated, virtual, and SRL matches are not pushed.

The website can show a notification only while the tab is open and the browser permission is granted. There is no Web Push subscription: Firebase has no web app for this project, and the service worker does not handle a `push` event. Closing the tab stops web alerts. Android alerts do not depend on that tab.

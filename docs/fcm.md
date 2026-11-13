# Push alerts (FCM)

HiOS kills `ScoreWatchService`. 0.4.2 turns the permanent path on. A high-priority FCM message names the sound channel (`betspapa.goal.horn.v4`, `betspapa.redcard.v1`, and the others). The phone poller stays as a fallback and skips a note id the push already marked sent.

`android/app/google-services.json` is the Firebase Android config for `com.betspapa.scores` in project `betspapa-app`. The Gradle build applies the Google services plugin and the messaging SDK because that file is present. The app reads the FCM token and posts it, with follows, followed trends, and prices, to `POST /api/devices`.

The server sends goal, kick-off, and followed-trend alerts through FCM HTTP v1 when a service account is set. Use one of:

- `FCM_SERVICE_ACCOUNT_JSON` — the raw JSON
- `FCM_SERVICE_ACCOUNT` — path to the file
- `GOOGLE_APPLICATION_CREDENTIALS` — path to the file

The JSON must include `project_id`, `client_email`, and `private_key`. Do not commit it. `GET /api/health` reports `push: true` when those fields are loaded. It does not return the key.

`POST /api/devices/test` with `{ "token" }` or `{ "latest": true }` sends one test message to a registered token. The process log records the FCM response (`name`, or the error status and message). The log never includes the service-account key or the access token.

A price under 1.20 is not pushed. Simulated, virtual, and SRL matches are not pushed.

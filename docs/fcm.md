# Push alerts (FCM)

HiOS kills `ScoreWatchService`. The permanent path is a high-priority FCM notification that names the sound channel (`betspapa.goal.horn.v4`, `betspapa.redcard.v1`, and the others). The phone poller stays as a fallback and skips a note id the push already marked sent.

0.4.0 compiles and runs **without** Firebase files. Push is off until both artifacts below are added.

## Needed from Firebase

1. **`android/app/google-services.json`** for package `com.betspapa.scores`. Download it from the Firebase project (Android app). The Gradle build applies the Google services plugin and the messaging SDK only when this file exists and is non-empty.
2. **A service account JSON** with Firebase Cloud Messaging permission, for the server. Set one of:
   - `FCM_SERVICE_ACCOUNT_JSON` — the raw JSON
   - `FCM_SERVICE_ACCOUNT` — path to the file
   - `GOOGLE_APPLICATION_CREDENTIALS` — path to the file

The JSON must include `project_id`, `client_email`, and `private_key`. Do not commit it.

The app posts the device token and follows to `POST /api/devices`. Without the service account the server stores the token and does not call Google.

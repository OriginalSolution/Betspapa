# Google Play: permissions and declarations for 0.4.11 (versionCode 34)

The bundle comes from the **Play bundle** workflow (`.github/workflows/play-aab.yml`), signed with the same key as v0.4.10. On Play this key is the **upload key**; use Play App Signing.

## Declarations Play Console will ask for

| Permission / component | Why Betspapa uses it | Play Console form |
| --- | --- | --- |
| `FOREGROUND_SERVICE_SPECIAL_USE` (ScoreWatchService, subtype "Live score alerts for matches the user follows") | Keeps live-score polling running while a followed match is in play so goal/FT alerts arrive on time | App content → **Foreground service permissions**: describe the use and attach a short video of a followed match alert |
| `FOREGROUND_SERVICE_DATA_SYNC` (same service) | Syncs live scores for followed matches | Same **Foreground service permissions** form (data sync). Android 15 limits this type to 6 h a day; the service stops cleanly on timeout |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | Asks the user to exempt Betspapa so killed-app alerts aren't delayed by Doze/OEM battery savers | Play's policy only allows this for core functions that Doze breaks. Be ready to justify it as real-time alerts, or remove it and keep the Settings deep link only |
| `SCHEDULE_EXACT_ALARM` | Wakes the watcher at kick-off of followed matches; falls back to inexact alarms when not granted | No form needed (user-granted, off by default on Android 14+) |
| `POST_NOTIFICATIONS` | Goal, kick-off, HT/FT and trend alerts | No form; asked at runtime |
| `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, `VIBRATE`, `INTERNET` | Restart the watcher after reboot, alert vibration, network | No form |
| `<queries>` for OEM settings packages | Opens the phone maker's autostart/battery screen from Settings | No form; package visibility is limited to the listed OEM packages |

`USE_EXACT_ALARM` was removed in 0.4.11: Play only allows it for alarm-clock and calendar apps.

## Other Play forms needed for the listing
- **Data safety:** the device registration sends the FCM token, followed matches/teams/trends, app version and country (from the edge header) to api.betspapa.com. No IP address is stored, nothing is shared or sold, and data is sent over HTTPS.
- **Privacy policy URL:** required. There isn't one on betspapa.com yet.
- **Ads:** none. **Target audience:** adults (it covers betting markets and booking codes). Expect the gambling-related content questions in the content rating form.

## Flags
- The upload keystore `android/betspapa-release.keystore` is committed with the public sideload password from the README. Play App Signing protects the key users receive, but anyone with the repo can sign as the upload key. Consider registering a new private upload key (Play Console → App integrity → Request upload key reset) before production.
- `TestAlertReceiver` is not exported in release builds (0.4.11). Debug builds export it for the adb QC harness.

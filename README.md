# Betspapa

Football matchday board. Today’s fixtures are grouped by competition, with Live and Following views, a match timeline, and alerts for kick-off, goals, red cards, half-time and full-time.

Betspapa tracks a matchday: scores, trends, picks, slips, and results. Club names identify fixtures. The board is today’s real kickoffs and prices. There is no simulated matchday.

## Fixtures

The default board is today’s real upcoming football from the Betspapa fixtures API, proxied at `/api/fixtures`. Kickoff times, competitions, and prices come from that feed. The site does not name a bookmaker as the source of those prices. In-play scores are not on a working endpoint, so Live stays empty until a match can be scored. If that feed is unreachable, the board stays empty and says so. There is no simulated matchday.

## Screens

- **Today / Live / Following** — scores, VAR on the minute, and squad tags when a side is weakened or heavily rotated.
- **Picks** — tips above 80%, grouped Elite / Strong / Qualified after the opponent check. Odds sort low-to-high or high-to-low. Softened tips are the ones an opponent dragged back through 80%.
- **Trends** — every tracked rate. Above 80% is bookmarked and tipped. Developing rows are form that is turning before the rate qualifies.
- **Slips** — every tip above 80% is booked here and tracked to a win or a bust. SportyBet, Football.com, MSport, Betika, and BetPawa cards show a real share code when that bookmaker accepts the slip, and an error when it does not. Betway is skipped because it needs a logged-in account. Codes are not invented.
- **Rankings** — your settled tips by market, team, and competition for the week, month, and year.
- **Lists** — blacklist and greenlist teams, competitions, and markets. Blacklisted tips leave the board. Greenlisted markets shape suggestions.
- **Alerts** — kick-off, VAR, confirmed goals, cards, half-time, full-time, squad flags, and win/bust on booked tips and the on-site slip.

Suggestions sit on Picks and follow the markets you slip or greenlist. Form is the last five results beside each trend and pick.

Alerts begin from the moment you follow a real fixture. Follows, alert settings and the inbox are stored in `localStorage` on this device.

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:5173.

```bash
npm test
npm run build
npm start
```

`npm start` serves the built app and the API on `0.0.0.0:$PORT` (8787 locally).

## Environment

Copy `.env.example` if you want live scores.

| Variable | Purpose |
| --- | --- |
| `FOOTBALL_DATA_API_KEY` | Token from [football-data.org](https://www.football-data.org/client/register). Stays on the server. Empty means demo mode. |
| `DATA_MODE` | `demo` or `live`. `live` is used only when a key is set. `demo` forces the simulation. |
| `PORT` | API port for local development. Render sets `PORT` in production. |

Live mode polls football-data.org every 20 seconds (list, plus detail for the open match and up to six followed in-play matches). The free tier is about 10 requests per minute and covers a limited set of competitions.

## Notifications

Settings can turn each event type on or off, and can enable browser notifications through the Notification API. Goal alerts also play `public/sounds/goal-cheer.wav`, a short original synthesized roar (not a stadium recording). The Goal cheer switch in Settings turns that sound off. A production build registers a service worker so a granted notification can reopen the match. In `npm run dev`, browser alerts use the page Notification API.

## Stack

Vite, React, TypeScript, and a small Node server that proxies football-data.org and serves the production build. The Android app is that same web build inside a Capacitor shell.

## Android APK

The sideload APK is Betspapa (`com.betspapa.scores`), version 0.2.2 (versionCode 4). It packages the same boards as the site. Fixtures load from the Betspapa fixtures API with Android’s native HTTP client, which does not send the WebView origin (`https://localhost`). That download can take a while on a slow connection, so the read timeout is 90 seconds. The last good board stays on screen if a later refresh times out. The board refreshes every 2 minutes, and a new request does not start while one is already running. The website keeps using same-origin `/api/fixtures`. Share codes are booked on the phone with that same native client, on the no-login Ghana desks (SportyBet, Football.com, MSport, Betika, BetPawa; Betway is skipped). Each desk’s card uses that bookmaker’s colors. The source label stays Betspapa fixtures. Android 13 and newer will ask for notification permission when you enable browser alerts.

## Unattended engine

`npm start` starts a booking cycle 20 seconds after boot and then every 15 minutes. It pulls the fixture feed, keeps the last good copy if the feed fails, qualifies tips above 80%, and books the open legs on the same five Ghana desks. It stores only codes a bookmaker returned. Invalid or missing codes are removed and those desks are retried. A stored win or loss that does not match the score is corrected when a score is present. The upcoming feed has no scores, so legs stay open until then. Failures are written to the process log and to the engine snapshot at `GET /api/engine`.

The snapshot is written to `data/engine/engine-state.json` (or `ENGINE_DATA_DIR`). On Render that file lasts until the service restarts; the next cycle then rebuilds it and rebooks any open legs that no longer have a valid code. A cron job every 15 minutes calls `POST /api/engine/run` with `ENGINE_RUN_TOKEN` so a sleeping service still runs a cycle. The cron does not book by itself and does not call Predict2u.

The signed 0.2.2 APK is assembled with JDK 21 and Android SDK 36. It was not installed on a phone or emulator, so the WebView origin was not executed on a device. Browser checks against the live feed are in `docs/progress/`.

### Rebuild

You need Node 20 or newer, JDK 21, and Android SDK 36. Point `ANDROID_HOME` at the SDK, then:

```bash
npm install
echo "sdk.dir=$ANDROID_HOME" > android/local.properties
npm run android:apk
```

The signed APK is written to `android/app/build/outputs/apk/release/app-release.apk`.

`npm run icons` redraws the web icons and the Android launcher and splash from the same mark.

### Signing

The release build is signed with `android/betspapa-release.keystore`, which is committed so a rebuild can be installed as an update over the GitHub APK. This key is only for that sideload distribution. It is not a Play Store upload key, and the password is public on purpose:

| Field | Value |
| --- | --- |
| Alias | `betspapa` |
| Store password | `betspapa` |
| Key password | `betspapa` |

Replacing the keystore makes Android treat the result as a different app, so existing installs will not upgrade in place. Do not reuse this keystore for a Play Console listing.

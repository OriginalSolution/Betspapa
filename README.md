# Betspapa

Football matchday board. Today’s fixtures are grouped by competition, with Live and Following views, a match timeline, and alerts for kick-off, goals, red cards, half-time and full-time.

Betspapa tracks a matchday: scores, trends, picks, slips, and results. Club names identify fixtures. The board is today’s real kickoffs and prices. There is no simulated matchday.

## Fixtures

The default board is today’s real upcoming football from the Betspapa fixtures API, proxied at `/api/fixtures`. Kickoff times, competitions, and prices come from that feed. The site does not name a bookmaker as the source of those prices. In-play scores are not on a working endpoint, so Live stays empty until a match can be scored. If that feed is unreachable, the board stays empty and says so. There is no simulated matchday.

## Screens

- **Today / Live / Following** — scores, VAR on the minute, and squad tags when a side is weakened or heavily rotated.
- **Picks** — one card per match. Every 80%+ market from the engine trends is a chip with the price and the real hit rate (for example 8/10). Sort by confidence, odds, or kickoff. Tap a chip to add it. Nothing under 1.20 is shown.
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

Settings can turn each event type on or off, and can enable browser notifications through the Notification API. On Android, browser alerts also post when the app is not on screen. A goal plays the cheer chosen in Settings: Crowd, Afrobeats, Chant, Papa Shout, Horn, or Arpeggio (`public/sounds/cheer-crowd.mp3`, `cheer-afro.mp3`, `cheer-chant.mp3`, `cheer-papa.mp3`). Papa Shout was recorded by the Betspapa owner and is used with permission. Off keeps that cheer silent. An older saved Cheer becomes Crowd, and an older Latin chant becomes Chant. The files peak near −8 dBFS and are not boosted. In the app they play at the volume slider, which starts at 60% (a gain of 0.6). Android goal notifications use the same choice, with one notification channel per sound, at the phone’s notification volume. Live, goal, and trend alerts use a custom card: a red Betspapa strip, the score, a 0′–90′ timeline, and Open, Mute match, and Share. A goal the feed does not time is marked with the match minute when the score change is first seen, and that minute stays on the card and the match page. Tapping the card or Open opens that match; a trend hit opens the trend or the slip. Alerts can be swiped away one at a time, with Undo, and the deletion is kept. Picks, trends, and bookings leave out any price under 1.20. A trend hit can show the booking chip and code. Settings → Notification style is Auto (follows the phone’s dark or light mode), Dark, or Light. Mute match is stored on the phone and stops later alerts for that match. Copy code copies a booking code. Licence notes sit beside the files in `public/sounds/SOURCES.txt`. The launch screen is the red Betspapa mark centered on black, then it fades. A production build registers a service worker so a granted notification can reopen the match. In `npm run dev`, browser alerts use the page Notification API.

## Stack

Vite, React, TypeScript, and a small Node server that proxies football-data.org and serves the production build. The Android app is that same web build inside a Capacitor shell.

## Android APK

The sideload APK is Betspapa (`com.betspapa.scores`), version 0.4.0 (versionCode 22). It packages the same boards as the site. Fixtures load from the Betspapa fixtures API with Android’s native HTTP client, which does not send the WebView origin (`https://localhost`). That download can take a while on a slow connection, so the read timeout is 90 seconds. The last good board stays on screen if a later refresh times out. The board refreshes every 2 minutes, and a new request does not start while one is already running. In-play matches are merged onto today’s board with the score when it is known, so a kickoff that has passed no longer stays under Upcoming. The website reads that in-play list through `/api/live`. The phone reads it with the same native client. Share codes for the master slip and each trend are read from https://api.betspapa.com/api/engine. The phone does not book those slips. Slips shows SportyBet, Football.com, MSport, Betika, and BetPawa. The selected desk’s master code can be copied or loaded, and each trend expands to its legs. Betway is skipped. Each desk’s card uses that bookmaker’s official mark and colors: SportyBet red and white, Football.com navy with a lime dot, MSport gold on charcoal, Betika’s B! on lime, and BetPawa’s grey-and-lime bP on charcoal. Fixture groups show the country flag beside its three-letter code. The source label stays Betspapa fixtures. Android 13 and newer will ask for notification permission when you enable browser alerts. With that permission on, kick-off, confirmed goals, half-time, full-time, and a followed trend hit are posted even when the app is on the home screen, in another app, or the screen is off. The first time the app opens after the splash, a full-screen setup walks through notifications, background activity, exact alarms when Android 12 or newer is blocking them, and Autostart on Tecno, Infinix, itel, Xiaomi, Redmi, POCO, Oppo, Realme, Vivo, iQOO, Huawei, Honor, and Samsung, then sends a test alert. Steps that are already allowed are skipped. Each step checks again when you come back and moves on when it is allowed. Skip for now leaves that step, and the phone remembers that this setup version was finished so it does not repeat on the next launch. Today and Alerts show “Live alerts are off — Fix now” when notifications, battery optimization, or exact alarms are still blocking alerts, including after you follow a team, match, or trend. Settings can run the setup again. A goal is held back only while the feed actually has a VAR review for that side, and a score is compared with the last confirmed tally stored on the phone. While a followed match is about to kick off or in play, a foreground watcher polls the feed about every 30 seconds and shows a low-priority notice, “Betspapa is watching N live matches”. That notice stays up with the app closed or swiped away, and it goes away when no followed match is live. A 15-minute worker and an exact alarm start the watcher before kick-off and after reboot. Settings shows whether notifications are allowed, whether battery optimization is unrestricted, and whether exact alarms are allowed, with buttons for each, a short note for Tecno, Infinix, itel, Xiaomi, Oppo, Realme, Vivo, Huawei, and Samsung autostart, a button that sends a test alert about 10 seconds later so you can close the app and confirm it arrives, and Run alert setup again. The full fixture list is not polled every few seconds; the tighter live check runs only in that window. Opening the app later does not repeat a notification or add a second Alerts row for the same event. Alerts has Clear old alerts, and Following has Clear old trends. Both ask you to confirm. Finished matches, settled trends, and alerts from before today are removed. Today’s live alerts, and follows for upcoming or live matches, stay. The removed rows stay gone after a restart because the seen-id record is kept.

## Unattended engine

`npm start` starts a booking cycle 20 seconds after boot and then every 15 minutes. It pulls the fixture feed, keeps the last good copy if the feed fails, qualifies tips above 80%, and books the master slip and each trend on the same five Ghana desks. It stores only codes a bookmaker returned. Invalid or missing codes are removed and those desks are retried. A stored win or loss that does not match the score is corrected when a score is present. The upcoming feed has no scores, so legs stay open until then. Failures are written to the process log and to the engine snapshot at `GET /api/engine`.

The snapshot is written to `data/engine/engine-state.json` (or `ENGINE_DATA_DIR`). On Render that file lasts until the service restarts; the next cycle then rebuilds it and rebooks any open legs that no longer have a valid code. A cron job every 15 minutes calls `POST /api/engine/run` with `ENGINE_RUN_TOKEN` so a sleeping service still runs a cycle. The cron does not book by itself and does not call Predict2u.

Club badges sit beside team names. The phone reads a stored crest first (`public/crests/crests.json`, keyed by team id and normalized name) so the board and Android notifications work offline after the first load. A scheduled engine pass resolves any team still missing: a logo on the fixture when the feed sends one, then TheSportsDB, Wikidata’s logo image, the Wikipedia club page, and for a national team the federation crest or the country flag. Youth, reserve, and women’s suffixes use the parent club badge. A close or ambiguous name keeps the initials circle instead of a wrong crest. Teams that still miss are listed in `public/crests/missing.json` and can be filled with `public/crests/overrides.json`. A broken image falls back to that mark. Following a team records kick-off once the listed start has passed, and goals, half-time, and full-time when a score is known. Those alerts stay in the Alerts tab if you open the app later. A missed score does not clear the board or the crests. Following a trend from Trends or Picks records an alert when that market hits (full-time 1X2, double chance, draw no bet, both teams to score, over/under 0.5–3.5, first-half result, and the other lines already on the board). Browser alerts, when enabled, also raise a device notification while the app is closed. The signed 0.3.9 APK is assembled with JDK 21 and Android SDK 36. A unit test posts a goal notification after the only activity has been destroyed, checks the Watching live scores label, and checks that a goal uses the Crowd, Afrobeats, Chant, or silent channel. The splash drawable is drawn in a unit test on a black frame. Settings and Today were checked in the browser.

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

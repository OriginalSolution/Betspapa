# Betspapa

Football matchday board. Today’s fixtures are grouped by competition, with Live and Following views, a match timeline, and alerts for kick-off, goals, red cards, half-time and full-time.

Betspapa tracks a matchday: scores, trends, picks, slips, and results. Club names identify fixtures. Demo mode does not call an external sports API. With a key, scores come from football-data.org. There is no other scores feed.

## Fixtures

The default board is today’s real upcoming football from `GET https://api.betspapa.com/api/sportybet/upcoming`, proxied at `/api/fixtures`. Kickoff times, competitions, and SportyBet odds are from that feed. In-play scores are not on a working endpoint, so Live stays empty until a match can be scored. Settings → Simulated matchday turns on the labeled demo, which is also the fallback if the feed is unreachable.

## Demo mode

The simulated matchday is not the default. Turn it on to watch a clock that moves one match minute every 8 seconds.

| Clock | What happens |
| --- | --- |
| 8s | Chelsea vs Man City kicks off |
| 16s | Havertz goal goes to VAR. Arsenal stay 2–1. No goal cheer and Over 3.5 stays open |
| 24s | Chelsea score. Chelsea to score wins. Havertz is still under review |
| 32s | Havertz is confirmed, the cheer plays, Over 3.5 wins, and the Ajax clean sheet busts |
| 72s | Liverpool red card and Barcelona half-time |

## Screens

- **Today / Live / Following** — scores, VAR on the minute, and squad tags when a side is weakened or heavily rotated.
- **Picks** — tips above 80%, grouped Elite / Strong / Qualified after the opponent check. Odds sort low-to-high or high-to-low. Softened tips are the ones an opponent dragged back through 80%.
- **Trends** — every tracked rate. Above 80% is bookmarked and tipped. Developing rows are form that is turning before the rate qualifies.
- **Slips** — demo booking codes for PapaSlip, Northline, and Kiosk Demo. Codes are labeled demo. No bookmaker API is connected.
- **Rankings** — your settled tips by market, team, and competition for the week, month, and year.
- **Lists** — blacklist and greenlist teams, competitions, and markets. Blacklisted tips leave the board. Greenlisted markets shape suggestions.
- **Alerts** — kick-off, VAR, confirmed goals, cards, half-time, full-time, squad flags, and win/bust on tips and booking codes.

Suggestions sit on Picks and follow the markets you slip or greenlist. Form is the last five results beside each trend and pick.

Follow Arsenal vs Liverpool, then wait. The goal arrives in Alerts and, if you allow notifications, as a browser notification. **Restart** in the header or Settings replays the clock. Alerts begin from the moment you follow. Yesterday and tomorrow use a fixed demo slate.

Follows, alert settings and the inbox are stored in `localStorage` on this device.

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

The sideload APK is Betspapa (`com.betspapa.scores`). It does not include the scores server, so it opens in demo mode: follows, the goal cheer, and simulated live events all run on the device. Android 13 and newer will ask for notification permission when you enable browser alerts.

This environment assembled and checked the signed release APK. It was not installed on a phone or emulator here.

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

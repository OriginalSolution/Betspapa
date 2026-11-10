# Betspapa

Football matchday board. Today’s fixtures are grouped by competition, with Live and Following views, a match timeline, and alerts for kick-off, goals, red cards, half-time and full-time.

Betspapa is an original product. It is not affiliated with SofaScore, the clubs, or the competitions. Club names identify fixtures. Demo mode does not call an external sports API.

## Demo mode

With no API key, the app runs a simulated matchday in the browser. The clock starts when the tab opens and moves one match minute every 8 seconds. The board refreshes on that same 8 second poll.

| Clock | What happens |
| --- | --- |
| 8s | Chelsea vs Man City kicks off |
| 16s | Atletico vs Sevilla kicks off |
| 24s | Arsenal goal, Chelsea goal, Barcelona goal, PSG goal, Bayern full-time |
| 32s | Inter and Ajax goals |
| 72s | Liverpool red card and Barcelona half-time |

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

Settings can turn each event type on or off, and can enable browser notifications through the Notification API. A production build registers a service worker so a granted notification can reopen the match. In `npm run dev`, browser alerts use the page Notification API.

## Stack

Vite, React, TypeScript, and a small Node server that proxies football-data.org and serves the production build.

# Betspapa hand-off

Written 28 Nov 2026, about 9:40 GMT (Africa/Accra). This file is the current picture of the product for the next person or agent. It names where secrets live. It does not contain passwords, API keys, tokens, private keys, or keystore material.

`main` at the start of this hand-off is `3a3daf3f51d9f66ab9431fd42d0e412ac524a562` (merge of PR #169). The public README lags the running system. Trust this file, then the code.

**Owner:** Riddim Boss. Repo: [OriginalSolution/Betspapa](https://github.com/OriginalSolution/Betspapa). Ready pull requests are merged with a merge commit, without asking. Do not squash.

## 1. Product and repo layout

Betspapa is a football matchday app: live scores, trends, picks, booking codes, slips, and alerts. The Android package is `com.betspapa.scores`. The client is Vite, React, and TypeScript inside a Capacitor shell. A Node server owns the fixture feed, the tip engine, booking, admin, and FCM push. `package.json` version `3.1.0` is the server package, not the Android version.

| Path | What it is |
| --- | --- |
| `src/` | Web and PWA UI. Picks, Codes, Slips, Trends, Alerts, Settings. Play-store copy is chosen with `VITE_STORE_BUILD=play` (`src/lib/storeBuild.ts`, `src/lib/pickCodes.ts`). |
| `android/` | Capacitor Android app. Version is `android/app/build.gradle`. Package `com.betspapa.scores`. |
| `server/` | API and engine. Entry `server/index.mjs`. Odds bands `server/oddsRange.mjs`. Codes `server/banker*.mjs`, `server/outsideBox.mjs`. Desk booking `server/bookers.mjs`. |
| `server/index.mjs` routes | `/api/health`, `/api/engine`, `/api/codes`, `/api/book`, `/api/fixtures`, `/api/devices`, `/admin`. |
| `public/` | Static site assets and crest files. |
| `.github/workflows/` | CI, Pages, Play AAB, sideload APK, native QC, monitor, AI fixer. |

The phone talks to `https://api.betspapa.com`. On localhost, Vite proxies `/api` to `http://127.0.0.1:8787` (`vite.config.ts`). `npm run dev` starts the site and the API together. `npm start` is `node server/index.mjs`.

Admin is a password-protected PWA at [https://api.betspapa.com/admin](https://api.betspapa.com/admin). Login uses `ADMIN_EMAIL` and `ADMIN_PASSWORD_HASH` (or `ADMIN_PASSWORD`) from the Render environment. Sessions last 12 hours, or 30 days with "Keep me signed in". Promo flyers and picture pushes are approve-first.

## 2. Infra and deploys

| Surface | Where |
| --- | --- |
| API | Render service `srv-dbr5crdckfvc73d8i51g`, workspace "Original Solutions" `tea-dbr591uc6qcc73crvc2g`. Public URL [https://api.betspapa.com](https://api.betspapa.com). Default host `https://betspapa-u7dd.onrender.com`. Auto-deploys from `main`. Paid Starter, Virginia, does not sleep. Dashboard: https://dashboard.render.com/web/srv-dbr5crdckfvc73d8i51g |
| Website | GitHub Pages, [https://betspapa.com](https://betspapa.com) and `www.betspapa.com`. Workflow `.github/workflows/pages.yml` on push to `main`. |
| Data disk | 1 GB disk `dsk-dbsgb0ei0phs73d2b210`, mount `/var/data`, `ENGINE_DATA_DIR=/var/data`. Devices, the booked board, and promo state live there. |
| Old Render service | `srv-d9c2n3bbc2fs73b5eh80` (`https://betspapa.onrender.com`) is suspended. Do not unsuspend it. Delete only after an explicit yes. |
| Other Render workspaces | "betspapa.com" `tea-d9c299navr4c73a67vs0` and "My Workspace" `tea-d95t79laeets73bjrlb0` are not this API. Do not change the unrelated apps in those workspaces. |

Live build and start, as set on the service: `cd server && npm install`, then `cd server && npm start`. There is no `server/package.json`; npm uses the repo root, where `npm start` is `node server/index.mjs`. The committed `render.yaml` is behind the live service. Do not treat it as the source of truth until someone updates it.

Health: `GET https://api.betspapa.com/api/health`. Expect `ok`, `mode: live`, `push: true` when FCM is configured, and a `guardian` field. `GET /api/engine` is the board. `GET /api/engine?view=app` is the phone payload. `GET /api/codes` is the Codes tab.

**FCM.** Project `betspapa-app`, project number `777460169811`. Android app `1:777460169811:android:c946be50ec736310b95aa6`. Data-only high-priority messages. The phone draws the Red Ticker. The service account is `FCM_SERVICE_ACCOUNT_JSON` (or a file path in `FCM_SERVICE_ACCOUNT` / `GOOGLE_APPLICATION_CREDENTIALS`). See `docs/fcm.md`.

**Fixtures and stats.** Live fixtures come from the SportyBet Ghana facts centre. Last-10 form, tables, and shot coordinates come from Sportradar gismo on `stats.fn.sportradar.com` (`match_info`, `stats_team_lastx`, `stats_season_tables`, `match_timeline`, `match_detailsextended`). Never use SofaScore. Never scrape it. Never brand the app with it.

**Bookmaker share endpoints (no logins).**

| Desk | Endpoint | Max legs |
| --- | --- | --- |
| SportyBet | `https://www.sportybet.com/api/gh/orders/share` | 50 |
| Football.com | `https://www.football.com/api/gh/orders/share` | 50 |
| MSport | `https://www.msport.com/api/gh/orders/real-sports/order/share` | 30 |
| Betika | `https://api.betika.com.gh/v2/share/` | 20 |
| betPawa | `https://www.betpawa.com.gh/api/sportsbook/` | 20 |

Betway is skipped. It needs a logged-in account. Never invent a code. Never trigger Predict2u. Codes strategies book SportyBet and Football.com only. The engine's tier slips still use the five desks above.

### Workflows

| Workflow | File | When |
| --- | --- | --- |
| CI | `.github/workflows/ci.yml` | Pull requests and pushes to `main`. Tests and the web build. |
| Pages | `.github/workflows/pages.yml` | Push to `main`. Publishes `dist`. |
| Play bundle | `.github/workflows/play-aab.yml` | Pull request when `build.gradle` or the manifests change, or `workflow_dispatch`. Signed AAB artifact. Does not upload to Play, tag, or release. |
| Sideload APK | `.github/workflows/sideload-apk.yml` | Same path filter. Signed universal APK. Does not release or tag. |
| Native QC | `.github/workflows/native-qc.yml` | Pull request when that workflow, `scripts/native-qc.sh`, or `AgreeQcTest.java` changes. Emulator API 34, sideload and Play matrix, against `api.betspapa.com`. |
| Monitor | `.github/workflows/monitor.yml` | Every 3 hours. Public URL checks. |
| AI fixer | `.github/workflows/ai-fixer.yml` | Guardian dispatch, a failed CI run on `main`, or a manual run. Opens a PR and merges only when checks pass. It does not publish a release, push a tag, or touch keystores. |

## 3. Android and Play

Package `com.betspapa.scores`. Current Play internal build: **0.4.42**, versionCode **65**, published 28 Nov 2026 at 04:30 GMT. That build is the layout fixes on top of the higher-table rule and the no-DC12 rule. It does not yet contain Under 4.5 Goals, Under 4.5 Goals 1.29+, or Shots Outside Box. Those are on the website and the API. They go into the next app build.

Play Console app to use: `4974678700321192662`. Never touch `4976459280848511213`. Internal testers: https://play.google.com/apps/internaltest/4699626149544871882

Two flavours, selected with `STORE_BUILD` / `VITE_STORE_BUILD`:

| | Sideload | Play (`play`) |
| --- | --- | --- |
| Bookmakers | Names, logos, and a Load button that opens the share link | Copy only. No bookmaker names, no logos, no Load |
| Tiers | 100%, 90%+, 80%+ | 10/10, 9/10+, 8/10+ |
| Disclaimer | — | 18+ line on Picks |

The Play workflow builds with `STORE_BUILD=play`, checks `versionCode` and `versionName` against `src/lib/appVersion.ts`, checks `targetSdk` at least 35, and checks the upload-key SHA-256:

`D0:B4:D5:86:87:33:F9:3E:05:50:77:FB:47:27:E4:D5:28:D4:25:65:D9:8C:7C:13:A5:8E:F7:84:3B:3C:A5:E7`

It then prints `sha256sum` of `android/app/build/outputs/bundle/release/app-release.aab` and uploads the artifact `betspapa-${versionName}-vc${versionCode}-aab`. The 0.4.42 bundle from run [46106353783](https://github.com/OriginalSolution/Betspapa/actions/runs/46106353783) is artifact `betspapa-0.4.42-vc65-aab`. Its `app-release.aab` sha256 is `37cecb99cc524e09aef14a65ae9f91654172eeb9b47249d227e0bbb5a7ccd76c`. That workflow never uploads the file to Play.

Signing material is not in the repo. Sideload uses GitHub secrets `LEGACY_KEYSTORE_*`. Play uses `PLAY_UPLOAD_*`. The same names exist in the owner's secrets folder on the build box. Do not print them. Do not commit them.

Native QC (`.github/workflows/native-qc.yml`, `scripts/native-qc.sh`) installs a debug build on a GitHub-hosted emulator and photographs Picks and Last 10 at 360, 412, fold cover, fold inner, tablet, landscape, large font, and a cutout. The version pin inside the workflow must match `build.gradle` or the job fails. The 0.4.42 pin passed on run [46106353860](https://github.com/OriginalSolution/Betspapa/actions/runs/46106353860) for both flavours.

## 4. Engine standing rules

These apply to picks, trends, slips, and the both-teams board. Codes strategies in §5 keep their own price rules. A blacklist always excludes. A green light never adds a leg that did not already qualify, and it never overrides the odds band.

### Odds table

Source: `server/oddsRange.mjs`. Inclusive unless noted.

| Market | Price |
| --- | --- |
| Win, and team to score 2+ | 1.20–1.49 |
| Draw no bet, and double chance 1X / X2 | 1.20–1.33 |
| Over/Under 1.5 | 1.20–1.30 |
| Over/Under 2.5 | 1.20–1.49 |
| Over/Under 3.5 | 1.20–1.60 |
| Both teams to score, and both teams not to score | 1.20–1.49 |
| Team to score over 0.5 | 1.18–1.30 |
| First-half over 0.5 | 1.18–1.25 |
| First-half over 1.5 | under 1.80 |
| Second-half over 0.5 | 1.18–1.25 |
| Exception | Up to **1.60** only when both samples are **10/10** (100%) on that market. An 80% "held" flag is not enough |

Double chance 12 is never picked or recommended (PR #162). The Last 10 table may still show the 12 column as information.

Team to score, draw no bet, and double chance 1X / X2 always back the side higher on the current league table (the lower position number). If there is no table, that leg is skipped. A green light does not override this (PR #161, `server/strongerSide.mjs`).

Both-teams-agree sits on Picks under the 10/10, 9/10+, and 8/10+ rings (PR #159). It retries a failed load. Last 10 is expanded and kept clear of the tab bar (PR #163).

A published pick still has to clear the trend (last 10, at least 8 scored, at least 80%), the team check, and the league check in `server/research.mjs`. Reasons for a drop are on `GET /api/engine`.

## 5. Codes strategies

The Codes tab reads `GET /api/codes`. Booking is inside the API process (`server/banker.mjs`), not a separate cron. Week codes are built Sunday 21:00 GMT. Dailies are built at 21:00 GMT the day before. A refresh only reads codes back. It does not book.

SportyBet and Football.com only. Parts of 50, each with its own copy button. Never invent a code. Never call Predict2u. Betway is not used. A blacklisted team, competition, or market is hidden on that phone. Youth, reserve, women, and simulated matches are skipped.

| Id | Name | Own rules |
| --- | --- | --- |
| `classic` | Banker Classic | Favourite on AH −1 at 2.00 or under. Under 1.80: 2UP. From 1.80 to 2.00: 1UP. No per-leg cap. Up to 50. |
| `gold` | Banker Gold | Same legs as Classic, and only when match Over 2.5 is under 1.40. Over 2.5 is a filter, not the leg. |
| `shield` | Banker Shield | Good defence (venue goals conceded at or below the league average, at least 6 games there): 2UP or 1UP as Classic. Leaky defence: Over 2.5 under 1.60. No defence table: skip. |
| `capped` | Banker Capped | Every leg at or under 1.45. AH −1 under 1.60 books Over 2.5. From 1.60 to under 2.00 books 2UP. If that is over the cap, team Over 1.5 if it is under the cap. |
| `ladder` | Banker Ladder | Dailies only. Weaker side scoring often: Over 2.5 from 1.20 to under 1.60. Rare scoring plus a favourite that scores 2+: team Over 1.5. Otherwise 2UP. |
| `under45` | Under 4.5 Goals | Under 4.5 above 1.25 is the filter. Expected goals from the last 10: average of home scored and away conceded, plus average of away scored and home conceded. Over 2.5 at 2.8 or more when both teams scored in at least 7 of 10. Otherwise Over 1.5 at 2.0 or more. No booked price above 1.50. Over 1.5 below 1.17 moves to Over 2.5 only when that bar is met and the price is 1.50 or under. |
| `under45plus` | Under 4.5 Goals 1.29+ | Same filter and goal averages. Every booked leg is 1.29–1.50. Over 2.5 below 1.29 is dropped. Over 1.5 below 1.29 moves to Over 2.5 only when that bar is met and Over 2.5 is 1.29–1.50. |
| `outsidebox` | Shots Outside Box | See below. Prices are whatever the market offers. Report the range. Do not force them through the general odds table. |

Both Under 4.5 strategies share one standings rule (PR #168). Skip the match when there is no live league table. Skip top-5 against top-5. Skip bottom-3 against bottom-3. A top-5 side against a bottom-3 side can still be booked.

**Shots Outside Box** (PR #169). Market `800054` ("Match Shots Outside Box") on SportyBet and Football.com. There is no named outside-box stat in the gismo feed. The count is derived from `match_timeline` shot X/Y (shots on target, off target, and blocked). A shot is outside the 18-yard box when it is more than 16.5m from the goal line or wider than the box. Home attacks high X. Away attacks low X. Both halves use that orientation on this feed.

Validation on 28 Nov 2026: Brentford 4–0 Everton (23 Nov) came out 4 and 2, matching the published split. Everton 3–1 Coventry (6 Nov) came out 3 and 5 against a published 3 and 7, because that timeline is missing shots. Treat the count as an estimate. A match with no positioned shots is left out of the sample. Each team needs at least 8 positioned games out of the last 10. Both must have reached the line in at least 8 of that sample. The tier is the lower rate. 100 means 10/10 only. Then 90+, then 80+. The highest line at the best tier is booked. Parts of 50 are separate per tier. On a Play build the tier reads 10/10, 9/10+, or 8/10+.

On the morning of 28 Nov 2026 the Under 4.5 week codes were `BT5S0T` (50) and `F5D5JW` (38), and the 1.29+ codes were `F8CVPR` (50) and `DA0SHC` (29). Shots Outside Box had 104 priced fixtures and no line both teams reached at 8/10, so no share code was posted. Those codes change at the next booking. Read `GET /api/codes` rather than this paragraph.

## 6. Owner standing rules

- No dummy data and no SofaScore.
- QC with live data. For a native change, photograph the real build against the production API at 360–412px, Z Fold cover and inner, tablet, landscape, large font, and safe areas. Check Xiaomi HyperOS sound: HyperOS leaves Sound off for a new app, and the cheer stays silent until it is turned on (`SettingsPage.tsx`).
- Do not ship an APK or AAB that still has a known gap.
- Mockups and the owner's approval come before a design change.
- Real crests only. Never initials as the intended mark.
- Merge a green pull request with the merge method. Do not ask first.
- Any charge needs the owner's yes in the same chat.
- A production release, a Play production submission, or a store-listing change needs the owner's yes.
- The AI fixer (`.github/workflows/ai-fixer.yml`) never publishes a release, never pushes a tag, and never touches a keystore or an env file.
- Pro prices are GHS 15 / 45 / 399 (`src/lib/proAccess.ts`). The flag `PRO_UI_ENABLED` in `src/lib/proFlag.ts` is **false**. Leave it false until Play products and real AdMob units exist.
- Keep the developer name **TraffiAlert GH** until the owner has the approvals. Do not accept the Play Terms of Service for him.
- Do not print secrets in chat, in a pull request, or in this file.

## 7. Secrets (names and locations only)

| Location | Names |
| --- | --- |
| Render env on `srv-dbr5crdckfvc73d8i51g` | `PORT` (injected), `ENGINE_DATA_DIR`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `ADMIN_PASSWORD` (prefer the hash), `FCM_SERVICE_ACCOUNT_JSON`, `FCM_SERVICE_ACCOUNT`, `GOOGLE_APPLICATION_CREDENTIALS`, `ENGINE_SNAPSHOT_TOKEN` or `GITHUB_TOKEN`, `GITHUB_DISPATCH_TOKEN`, `DATA_MODE` (leave unset or anything other than `demo`) |
| GitHub Actions secrets | `LEGACY_KEYSTORE_*` (sideload), `PLAY_UPLOAD_*` (Play AAB), `XAI_API_KEY` (AI fixer; the workflow exits cleanly when it is missing), `RENDER_DEPLOY_HOOK` (monitor redeploy; still not set) |
| `/home/box/secrets/betspapa-admin/` | `email.txt`, `password.txt`, `hash.txt` |
| `/home/box/secrets/betspapa-firebase/` | `service-account.json` |
| `/home/box/secrets/render-env-backup-2026-11-13/Betspapa.env` | A snapshot of Render env names from 13 Nov 2026. Do not copy it into the repo |
| Committed, not a secret | `android/app/google-services.json` is the Firebase Android client file for `betspapa-app`. It is not the service-account private key |

A 13 Nov 2026 env backup also listed names that current code does not read: `ADMIN_SYNC_SECRET`, `ALLOWED_ORIGINS`, `API_STATS_KEY`, `FOOTBALL_API_KEY`, `ODDS_API_KEY`, `PUSH_SUBJECT`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`. Confirm before deleting them from Render.

The monitor workflow also looks for `GMAIL_APP_PASSWORD`. It is not required for the product.

## 8. Recent history (about 27–28 Nov 2026)

There is no pull request 158.

| PR | What landed |
| --- | --- |
| [#149](https://github.com/OriginalSolution/Betspapa/pull/149) | Play form names, bundle 0.4.33 |
| [#150](https://github.com/OriginalSolution/Betspapa/pull/150) | Copy-only Play bundle 0.4.35 |
| [#151](https://github.com/OriginalSolution/Betspapa/pull/151), [#152](https://github.com/OriginalSolution/Betspapa/pull/152) | Several slips at once |
| [#153](https://github.com/OriginalSolution/Betspapa/pull/153) | Blacklist or greenlight a team from a slip leg |
| [#154](https://github.com/OriginalSolution/Betspapa/pull/154) | 0.4.37 slips, alerts, team lists |
| [#155](https://github.com/OriginalSolution/Betspapa/pull/155) | Settle and trend pushes carry the match, pick, odds, and slip |
| [#156](https://github.com/OriginalSolution/Betspapa/pull/156) | 0.4.38 |
| [#157](https://github.com/OriginalSolution/Betspapa/pull/157) | 0.4.39 neutral Play codes and a full settle score |
| [#159](https://github.com/OriginalSolution/Betspapa/pull/159) | Both teams agree under the Picks rings |
| [#160](https://github.com/OriginalSolution/Betspapa/pull/160) | Still **open**. Native emulator QC for both-teams agree |
| [#161](https://github.com/OriginalSolution/Betspapa/pull/161) | Higher-placed side on team lines |
| [#162](https://github.com/OriginalSolution/Betspapa/pull/162) | Never recommend double chance 12 |
| [#163](https://github.com/OriginalSolution/Betspapa/pull/163) | Tab bar clearance and full Last 10 |
| [#164](https://github.com/OriginalSolution/Betspapa/pull/164) | Play bundle 0.4.41 (versionCode 64). Built before the layout fixes |
| [#165](https://github.com/OriginalSolution/Betspapa/pull/165) | Play bundle 0.4.42 (versionCode 65). This is the published internal build |
| [#166](https://github.com/OriginalSolution/Betspapa/pull/166) | Under 4.5 Goals |
| [#167](https://github.com/OriginalSolution/Betspapa/pull/167) | Under 4.5 Goals 1.29+, leaving the original strategy's prices alone |
| [#168](https://github.com/OriginalSolution/Betspapa/pull/168) | Table extremes on both Under 4.5 strategies |
| [#169](https://github.com/OriginalSolution/Betspapa/pull/169) | Shots Outside Box |

## 9. Open items

Do not start these without the owner's yes where the list says so.

1. **Xiaomi, app swiped away.** Confirm the goal cheer still plays, or fails in a known way, after the app is swiped off the recents list. HyperOS sound must be on.
2. **Pro billing.** Products `betspapa_pro_weekly`, `betspapa_pro_monthly`, `betspapa_pro_yearly` at GHS 15 / 45 / 399. `PRO_UI_ENABLED` stays false.
3. **Store listing, screenshots, and production submission.** Needs the owner's yes. Do not accept the Play Terms of Service for him. Developer name stays TraffiAlert GH until he has the approvals.
4. **Data-deletion page** and **trader name** for the store listing. Not written yet.
5. **Reviewer promo code.** Not issued. Do not invent one.
6. **AdMob.** Not created. The Pro flag comment says test ads appear only when that flag is on.
7. **Signing-key history.** The keystore was removed from the tree on 21 Nov 2026 and remains in older git history. Do not recommit it. A history rewrite needs the owner's yes.
8. **[PR #137](https://github.com/OriginalSolution/Betspapa/pull/137)** is still open (`0.4.32: track several slips at once`). Its sideload `apk` check is failing. Later slip work landed in #151 and #152. Do not merge #137 on top of `main` without reading the diff.
9. **[PR #160](https://github.com/OriginalSolution/Betspapa/pull/160)** is still open (native emulator QC).
10. **GitHub Pages.** The site workflow has failed at the artifact step on some 28 Nov pushes. After a `main` merge, confirm https://betspapa.com actually updated.
11. **`render.yaml` and the README** still lag the live service.
12. **`RENDER_DEPLOY_HOOK`** is unset, so the monitor cannot redeploy by itself.
13. **Suspended Render service** `srv-d9c2n3bbc2fs73b5eh80`. Delete only after an explicit yes.
14. **Shots Outside Box** had no qualifying line on the morning of 28 Nov. The next 21:00 GMT booking will try again. Do not lower the 8/10 bar unless the owner says so.

## 10. Ship a change

```bash
git clone https://github.com/OriginalSolution/Betspapa.git
cd Betspapa
git checkout main
npm install
npm test
npm run dev    # site :5173, API :8787
```

Land the change with a merge commit. Wait for CI. Render deploys `main` by itself. Check `/api/health` and the surface you changed. For a Play bundle, change `android/app/build.gradle` and `src/lib/appVersion.ts` together so the workflow runs, then read the run log for the signer line and the `sha256sum` of `app-release.aab`. Do not upload that file, and do not push a tag, unless the owner has said yes to a release.

When the product changes in a way the next person would miss, update this file and date it.

# Betspapa hand-off

Written 14 Nov 2026, about 7:30 PM Africa/Accra (UTC+0), so another bot or account can pick up the project from scratch. This document names secrets and says where they live. It does not contain passwords, API keys, tokens, private keys, or keystore material beyond the public sideload passwords already printed in [README.md](./README.md).

The public website README is useful for product tone, but it lags the running system in several places (it still mentions football-data.org demo mode, version 0.4.4, and an empty Live tab). Trust this file and the live server for current state, then treat the README as the public-facing description.

## 1. Overview and current state

Betspapa is Riddim Boss's football matchday app: live scores, trends, picks, bookmaker booking codes, slips, and alerts. The product goal is a SofaScore-style scores-and-alerts experience, plus engine-backed tips that are booked onto Ghana bookmakers. The Android package is `com.betspapa.scores`. The stack is Vite + React + TypeScript in a Capacitor shell, with a Node server that owns the fixture feed, the tip engine, booking, admin, and FCM push.

**Owner:** Riddim Boss. GitHub org and repo: [OriginalSolution/Betspapa](https://github.com/OriginalSolution/Betspapa). The GitHub user on this account also appears as `riddimbossy-prog` (same account as the former personal login).

**What is live now (checked 14 Nov 2026, about 7:26 PM Africa/Accra):**

- Website: [https://betspapa.com/](https://betspapa.com/) on GitHub Pages (also `www.betspapa.com`).
- API: [https://api.betspapa.com](https://api.betspapa.com) on Render, service `srv-dbr5crdckfvc73d8i51g`, paid Starter plan, region Virginia. Default hostname: [https://betspapa-u7dd.onrender.com](https://betspapa-u7dd.onrender.com). The API root redirects to betspapa.com. Cloudflare sits in front of the custom API domain.
- `GET https://api.betspapa.com/api/health` returned `ok: true`, `mode: live`, `provider: SportyBet`, `fixtures: live`, `push: true`, `guardian: ok`.
- `GET /api/engine` (app view) was serving a fresh board (`updatedAt` 7:21 PM Africa/Accra) with booked codes on all five desks for the 100% and 90%+ tiers and their market splits. The in-process engine books on a cycle (20 seconds after boot, then about every 15 minutes) and Papa Guardian is the watchdog.
- Latest **published** Android build: [Betspapa 0.4.8](https://github.com/OriginalSolution/Betspapa/releases/tag/v0.4.8) (versionName `0.4.8`, versionCode **30**), APK: `https://github.com/OriginalSolution/Betspapa/releases/download/v0.4.8/app-release.apk`. `main` still has this version in `android/app/build.gradle`.
- A **v0.4.9 draft** exists (versionCode **31**, branch `cursor/apk-049-5587`) and is unpublished. The owner said to fix everything and verify it live before giving him a new APK. Do not publish 0.4.9 until the items in §7 are done.

**What 0.4.8 already shipped:** faster tab switches (picks kept in memory, lists drawn in pages, slimmer engine payload, built-in crest map). Measured tab switches on a test phone were about 150–256 ms, down from around 10 seconds. That client build does not by itself fix notification delivery.

**Admin:** a password-protected installable PWA at [https://api.betspapa.com/admin](https://api.betspapa.com/admin). Email + password login. Sessions last 12 hours, or 30 days if "Keep me signed in" is checked (browser may also remember the password). Promo flyers, the home carousel, and picture notifications to all users use an approve-first switch that starts **on**.

**Push:** Firebase Cloud Messaging (FCM HTTP v1). Data-only high-priority messages; the phone builds the Red Ticker UI itself. The on-phone poller is the fallback. See [docs/fcm.md](./docs/fcm.md).

**Update 15 Nov 2026:** the approved 1 GB disk `dsk-dbsgb0ei0phs73d2b210` is mounted at `/var/data` on `srv-dbr5crdckfvc73d8i51g`, and `ENGINE_DATA_DIR=/var/data` is set. Devices, the booked board, and promo state all live in that directory. Papa Guardian runs on boot and after every engine cycle. It switches the process to live mode, keeps the last booked board up, drops odds violators (the 1.60 exception only when both samples are 10/10), rebooks kicked-off legs and missing desk parts, and raises `guardian: "attention"` with a plain `reason` when it cannot fix something. `/api/health` includes a `checks` list. `/api/guardian` returns that status JSON.

**Earlier incident:** device registrations had been stored on the ephemeral disk, so restarts wiped `devices.json` and pushes had nobody to send to. The owner approved the 1 GB disk (~$0.25/month) on 14 Nov 2026 at 1:49 PM Africa/Accra. It was not attached at 7:26 PM that day. It is attached now. Do not publish 0.4.9 until a restart leaves the device count unchanged.

A public `engine-data` branch stores `engine-state.json` so a restart can reload the last booked board without a disk. That snapshot does **not** persist FCM device tokens.

## 2. Repos, branches, deploys, and Actions

### Repository

| Item | Value |
| --- | --- |
| Repo | https://github.com/OriginalSolution/Betspapa |
| Visibility | **Public** (not a fork) |
| Default branch | `main` |
| Created | 15 Jul 2026, 10:37 PM Africa/Accra |
| Node | `>=20` (CI uses 22) |
| `package.json` version | `3.0.0` (this is not the Android version) |
| Issues / wiki / projects | Enabled |
| Pages | Enabled, source `main`, build type `workflow` (`.github/workflows/pages.yml`) |

`main` at the time of this writing: `b3824f366b76919cea5524b61988bc06f64b0a38` (merge of PR #71, 14 Nov 2026, 1:33 PM Africa/Accra). Auto-deploy on Render follows `main`.

### Important branches

| Branch | Role |
| --- | --- |
| `main` | Production for the website, API auto-deploy, and the 0.4.8 version codes |
| `engine-data` | Stores `engine-state.json` (last booked board). Not a product branch. Unprotected. Last seen commit `5792e0e982abcdf3ff6e0f0a1e6159399366dee7` at 11:18 AM Africa/Accra on 14 Nov 2026 |
| `cursor/apk-049-5587` | Unpublished 0.4.9 APK (versionCode 31). Draft GitHub Release `v0.4.9` points here |
| `cursor/keep-booked-board-5587` | Open [PR #66](https://github.com/OriginalSolution/Betspapa/pull/66): keep restored share codes attached to open matches after a restart |

Many historical `cursor/*` and `feature/*` / `fix/*` / `ppg-*` / `hard-rule/*` branches remain on the remote. They are leftover worktrees, not the deploy path.

### Pull requests

Ready PRs are merged with the **merge** method (not squash, not rebase), without asking. Recent engine work on 14 Nov 2026 includes PRs #56–#71 (odds-range enforcement, restart persistence, per-tier slips, 50-leg parts, live mode, tab speed). [PR #66](https://github.com/OriginalSolution/Betspapa/pull/66) is still open.

### GitHub Actions (in the repo on `main`)

| Workflow | File | When | What |
| --- | --- | --- | --- |
| CI | `.github/workflows/ci.yml` | PRs and pushes to `main` | `npm ci`, install ffmpeg, `npm test`, `npm run build` |
| Deploy Betspapa | `.github/workflows/pages.yml` | Pushes to `main`, and `workflow_dispatch` | Builds the Vite app and deploys GitHub Pages (`dist`, plus `dist/404.html`). Environment: `github-pages` |
| Monitor (self-healing) | `.github/workflows/monitor.yml` | Cron `23 */3 * * *` UTC (every 3 hours at :23), and `workflow_dispatch` | Hits public URLs; can open issues; can redeploy if `RENDER_DEPLOY_HOOK` is set |

Latest monitor run seen: 14 Nov 2026, 6:17 PM Africa/Accra, success (run `43625805224`).

**Orphan workflows still marked active in the GitHub UI, but their YAML is not on `main`:** Server Check, Server Test Debug, Transition Candidate Scope Patch, Transition Safety Branch Patch. They will fail if triggered. Safe to disable once you confirm nothing still depends on them.

### Render deploy

The live web service auto-deploys on commits to `main` (`autoDeploy: yes`). Last successful deploy seen: `dep-dbs66h15efls73echi4g` at 1:34 PM Africa/Accra on 14 Nov 2026, following PR #71.

Live build/start (from the Render service, not from `render.yaml`):

- Build: `cd server && npm install`
- Start: `cd server && npm start`

There is no `server/package.json`. npm walks up to the repo root, where `npm start` is `node server/index.mjs`. That is why these commands work. The committed [render.yaml](./render.yaml) is **out of date**: it uses root `npm install && npm run build` / `npm start`, sets `healthCheckPath: /api/health`, and describes a `betspapa-engine` cron every 15 minutes. That cron service was **not** present in the Render workspace. The engine runs **inside** the web process. The live service also has an empty health-check path, even though `/api/health` exists and is what the monitor uses.

### Android releases

Signed sideload APKs are published as GitHub Releases with `npm run android:apk`. The keystore `android/betspapa-release.keystore` is committed. Alias, store password, and key password are the public sideload values in the README "Signing" table. This is not a Play Store upload key. Replacing the keystore breaks in-place upgrades.

Recent tags: 0.2.x through 0.4.8 (0.4.8 is the latest published release). 0.4.9 is a draft only (APK plus QC screenshots `picks-049.png` and `picks-049-codes.png` are attached to the untagged draft).

## 3. Services and accounts

Login emails below were taken from Render / Firebase metadata, the repo, or the owner's stated payment rule. Anything not verified in those places is marked unverified.

| Service | What it is | IDs / URLs | Login / identity |
| --- | --- | --- | --- |
| GitHub | Source, Pages, Releases, Actions | Org `OriginalSolution`, repo `Betspapa`. Authenticated `gh` user on the shared box: `riddimbossy-prog` | GitHub account `riddimbossy-prog` / org `OriginalSolution` |
| Render workspace "Original Solutions" | **Current** API host | Workspace id `tea-dbr591uc6qcc73crvc2g`. Service **Betspapa** `srv-dbr5crdckfvc73d8i51g`, slug `betspapa-u7dd`, dashboard https://dashboard.render.com/web/srv-dbr5crdckfvc73d8i51g | Workspace email **riddimbossy@gmail.com** (verified via Render MCP `list_workspaces`) |
| Render workspace "betspapa.com" | Holds the **old** Betspapa service and other apps | Workspace id `tea-d9c299navr4c73a67vs0` | Same email, **riddimbossy@gmail.com** |
| Render workspace "My Workspace" | Unrelated default workspace | Workspace id `tea-d95t79laeets73bjrlb0` | Same email, **riddimbossy@gmail.com** |
| Old Render service | Suspended, pending deletion | `srv-d9c2n3bbc2fs73b5eh80`, name Betspapa, plan **standard**, URL https://betspapa.onrender.com, rootDir `server`, suspended by user since 13 Nov 2026, 12:00 AM Africa/Accra. Dashboard: https://dashboard.render.com/web/srv-d9c2n3bbc2fs73b5eh80 | Same Render login. Do not unsuspend it. Delete only after the owner confirms (destructive) |
| Custom API domain | `api.betspapa.com` → current Render service, TLS via Cloudflare in front of Render | Public health and admin work on this host | Cloudflare account **unverified** in this pass (headers show Cloudflare; DNS host was not looked up in an account tool) |
| GitHub Pages | `betspapa.com` and `www.betspapa.com` | HTTPS certificate approved, expires **10 Feb 2027**, HTTPS enforced | GitHub org above |
| Firebase | FCM for Android | Project id **`betspapa-app`**, project number `777460169811`, display name Betspapa, state ACTIVE. Android app id `1:777460169811:android:c946be50ec736310b95aa6`, package `com.betspapa.scores`. A Hosting site id `betspapa-app` exists; the public website is **not** served from Firebase Hosting. Billing: **not enabled**. No iOS or web app was listed | Firebase CLI/MCP was signed in as **predict2u@gmail.com** on 14 Nov 2026. Whether that address is the project owner is **unverified** |
| Admin PWA | Operator console | https://api.betspapa.com/admin | Email + password from Render env (`ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`). The login email is **not** in the repo or in Render/Firebase metadata dumps, so it is not written here. The value lives in `/home/box/secrets/betspapa-admin/email.txt` (see §4) |
| Bookmakers (no accounts) | Share-code booking only | SportyBet, Football.com, MSport, Betika, betPawa — Ghana no-login share endpoints. Betway is skipped. Never invent a code. Never trigger Predict2u's booking job | No bookmaker logins are used |
| Payment / provider applications | Card and provider sign-ups | Mastercard ending **1941**, stored in the vault | Use **meditusa2023@gmail.com** for payment and provider account applications |
| Gmail back channel (standing owner rule, not a Betspapa mailbox this bot sends from) | Owner can email a fix request | Subject line: `Betspapa fix` | To **meditusa2023@gmail.com**. This hand-off does not grant email-sending permission |
| Coding cloud agent | Used for recent server/app PRs | https://cursor.com/agents/bc-a385cb14-ded1-5995-9ee5-02b6a03d5587 (id `bc-a385cb14-ded1-5995-9ee5-02b6a03d5587`) | Cursor account of the owner. An earlier agent `bc-04f1af2f-0124-5963-b4f4-d630ba5fba40` stalled and was cancelled |

The "Original Solutions" Render workspace also hosts unrelated apps (nsaabo, p2u-relay, verzzify, voxy, traffialert-pay). Do not change those while working on Betspapa. The "betspapa.com" workspace likewise still has older copies of some of those apps.

## 4. Environment variable names and secret locations

Never commit raw values. Never paste them into chat, PRs, or this file.

### Where secrets live

| Location | What is there (names only) |
| --- | --- |
| `/home/box/secrets/betspapa-admin/` | `email.txt`, `password.txt`, `hash.txt` — admin login and the password hash to put in `ADMIN_PASSWORD_HASH` |
| `/home/box/secrets/betspapa-firebase/` | `service-account.json` — Firebase/FCM service account (contains `project_id`, `client_email`, `private_key`). Do not commit it |
| `/home/box/secrets/render-env-backup-2026-11-13/Betspapa.env` | Snapshot of Render env from 13 Nov 2026. Use it only to recover **names** or to restore onto Render; do not copy it into the repo |
| GitHub repo secrets (`gh secret list -R OriginalSolution/Betspapa`) | Only **`ADMIN_SYNC_SECRET`** (added 16 Jul 2026). That name is **not referenced in current code** and looks leftover |
| GitHub org secrets | Not listable with current auth (`404`) |
| GitHub environment `github-pages` | No extra secrets listed |
| Vault | Owner's Mastercard ending 1941, and other personal credentials. Every charge still needs a yes in chat |
| Committed, intentionally public | `android/betspapa-release.keystore` plus the passwords in the README Signing table |
| Committed client config | `android/app/google-services.json` — Firebase Android client config for `betspapa-app` / `com.betspapa.scores`. This is the mobile SDK file, not the service account. Do not add the service-account private key beside it |

A service-account client email string `push@betspapa-app.iam.gserviceaccount.com` appears in the repo (not a human login).

### Variables the current server code reads

| Name | Purpose |
| --- | --- |
| `PORT` | Listen port. Render injects this. Local default is 8787. Do not set `PORT` yourself on Render |
| `NODE_ENV` | Usual Node environment |
| `RENDER` | Set by Render |
| `DATA_MODE` | `demo` forces simulated scores (forbidden in production). Any other value, including unset, is **live**. Live health was `mode: live` on 14 Nov 2026 |
| `FOOTBALL_DATA_API_KEY` | Optional legacy token for `/api/matches`. Live fixtures and push do **not** need it |
| `ENGINE_DATA_DIR` | Directory for `engine-state.json`, `devices.json`, promo state, and health files. Default: `data/engine` under the process cwd (ephemeral on Render). Point this at the approved persistent disk once it is attached |
| `ENGINE_RUN_TOKEN` | Bearer for `POST /api/engine/run` (external tick). `render.yaml` would generate one; confirm it is set if you add a cron |
| `ENGINE_SNAPSHOT_REPO` | Defaults to `OriginalSolution/Betspapa` |
| `ENGINE_SNAPSHOT_TOKEN` or `GITHUB_TOKEN` or `GH_TOKEN` | Token used to **publish** the snapshot to the `engine-data` branch. Loading can use the public raw URL |
| `BETSPAPA_URL` / `RENDER_EXTERNAL_URL` | Public base URL, used by the unused yaml cron sketch |
| `ADMIN_EMAIL` | Admin login email |
| `ADMIN_PASSWORD_HASH` | Preferred password verifier; also used to derive the session cookie key |
| `ADMIN_PASSWORD` | Fallback if no hash is set. Prefer the hash. The plaintext belongs only in the secrets folder / Render dashboard, never in git |
| `FCM_SERVICE_ACCOUNT_JSON` | Raw service-account JSON (preferred inline form) |
| `FCM_SERVICE_ACCOUNT` | Path to that JSON file |
| `GOOGLE_APPLICATION_CREDENTIALS` | Alternative path to the same JSON. Health reports `push: true` when `project_id`, `client_email`, and `private_key` loaded. Live health was `push: true` |

### Names seen in the 13 Nov 2026 Render env backup, not used in current code

These may still be set on the service. Confirm before deleting: `ADMIN_SYNC_SECRET`, `ALLOWED_ORIGINS`, `API_STATS_KEY`, `FOOTBALL_API_KEY` (old name), `ODDS_API_KEY`, `PUSH_SUBJECT`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`.

### Names the monitor workflow wants (repo secrets — currently missing except as noted)

`.github/workflows/monitor.yml` reads `RENDER_DEPLOY_HOOK`, `SUPABASE_ANON_KEY`, and `GMAIL_APP_PASSWORD`. It also hardcodes `MAIL_FROM` and `MAIL_TO`. None of `RENDER_DEPLOY_HOOK`, `SUPABASE_ANON_KEY`, or `GMAIL_APP_PASSWORD` appeared in `gh secret list` for this repo, so the monitor can check URLs but **cannot** trigger a Render redeploy or send mail until those secrets are added. Adding them needs the owner's yes if it costs anything or opens a mailbox.

### Useful public API routes

`/api/health`, `/api/health/full`, `/api/guardian`, `/api/engine`, `/api/engine/run`, `/api/fixtures`, `/api/live`, `/api/promos`, `/api/config`, `/api/book`, `/api/devices`, `/api/devices/test`, `/api/matches`, `/api/sportybet/upcoming`, `/admin`, `/admin/login`, `/admin/logout`, `/api/admin/*` (overview, cycle, health, promos, settings, push-test). The phone should use the slim engine payload (the server trims books, caps master legs, and omits tier legs in the app view).

## 5. Costs and renewals

Every charge needs Riddim Boss's explicit yes in chat first. About **$654** of the card budget was left on the Mastercard ending 1941 (vault) as of this writing. Do not buy, resize, or unsuspend paid resources without that yes.

| Item | Status | Cost / renewal notes |
| --- | --- | --- |
| Render web service `srv-dbr5crdckfvc73d8i51g` | Running, paid **Starter**, 1 instance, does not sleep | Recurring Render subscription on the "Original Solutions" workspace. Exact monthly invoice amount was not read from billing in this pass |
| Render disk 1 GB on that service | **Approved** 14 Nov 2026, 1:49 PM Africa/Accra, about **$0.25/month**. **Not attached yet** | Attach, mount, set `ENGINE_DATA_DIR`, redeploy, then verify. Do not attach a larger disk without a new yes |
| Old Render service `srv-d9c2n3bbc2fs73b5eh80` | Suspended (user), plan **standard** | Leave suspended. Delete when the owner confirms, so it cannot accidentally start billing again |
| Firebase project `betspapa-app` | FCM in use, **billing not enabled** | Stay on the no-billing plan unless a paid Firebase product is approved |
| GitHub repo + Pages + Actions | Public repo | Pages and the scheduled monitor are free on a public repo. The Pages certificate expires **10 Feb 2027** |
| Sideload keystore | Committed | No yearly fee. Do not reuse it for Play Console |
| Bookmaker share endpoints | Free, no accounts | No subscription |

## 6. Routines and monitor

### Betspapa nightly QC

A Cursor/Grok Bot routine named **Betspapa nightly QC**, folder roughly `betspapa-nightly-qc`, runs daily around **4:30 AM Africa/Accra**. It should quality-check the live board (kicked-off legs, missing codes, range violations, health/guardian) and fix what it can. It should message the owner only when something needs him. Its first run (14 Nov 2026, 4:31 AM Africa/Accra) found kicked-off legs still inside booking codes; that class of bug was addressed in later 14 Nov PRs, but the routine remains the daily net.

The routine definition was not found as a file on this box during this pass. If you cannot see it in the owner's routines list, recreate it lean (once a day, self-repair first, ping the owner only for payments or decisions).

### GitHub Actions monitor

`.github/monitor/checks.json` currently checks:

- https://betspapa.com/ contains "Betspapa"
- https://api.betspapa.com/api/health is ok and contains `"guardian":"ok"` (optional redeploy via `RENDER_DEPLOY_HOOK`)
- https://api.betspapa.com/api/engine contains `sportybet` (booked codes present)
- https://api.betspapa.com/api/promos
- https://api.betspapa.com/admin
- Certificates for `betspapa.com` and `api.betspapa.com`

`RENDER_DEPLOY_HOOK` is still missing (open item). Until a hook secret is stored, a failed guardian check will not redeploy the service.

Papa Guardian is independent of both the routine and the Actions monitor. It runs inside the Node process and is exposed at `/api/health` (`guardian`) and `/api/guardian`.

## 7. Open issues and pending decisions

Do **not** publish a new APK until the owner-facing issues are fixed and checked on the live server with real data and screenshots.

1. **Confirm the 1 GB disk survives a restart.** It is mounted at `/var/data` (`dsk-dbsgb0ei0phs73d2b210`) and `ENGINE_DATA_DIR=/var/data`. `devices.json` and `engine-state.json` must still be there after a restart, and the device count must not fall to 0.
2. **Notification delivery verification.** Register a real phone after the disk is on, send `POST /api/devices/test`, confirm a Red Ticker arrives with the app closed, and confirm the token is still there after a restart. This was the reason 0.4.9 was held back.
3. **Publish 0.4.9 only after (1) and (2)** plus a live QC of codes, odds ranges, and per-code copy buttons. The draft already exists on `cursor/apk-049-5587`.
4. **Open [PR #66](https://github.com/OriginalSolution/Betspapa/pull/66)** — restored share codes should stay attached to open matches. Review and merge (merge method) if it is still correct and not already superseded by later `main` commits.
5. **Search Option B** was approved earlier and is still to be built.
6. **SEO for betspapa.com** is awaiting the owner's go-ahead. Do not start it unasked.
7. **Crest coverage numbers** were supposed to be reported with 0.4.2; confirm current coverage and fill `public/crests/missing.json` / `overrides.json` rather than falling back to initials (the standing rule is real crests, never initials).
8. **Live incident source** for red card, VAR, and penalty: [docs/live-feed.md](./docs/live-feed.md) records that the SportyBet factsCenter payloads used on 13 Nov 2026 do not include timeline / incidents / `varReview`. Settings can still play those test sounds. A real source is still needed.
9. **Delete the old Render service** `srv-d9c2n3bbc2fs73b5eh80` after an explicit yes. It is already suspended.
10. **Add GitHub secret `RENDER_DEPLOY_HOOK`** (and only then expect the monitor to redeploy). Optional mail secrets are also missing.
11. **`render.yaml` and the README** should be updated so they match the live service (live-by-default, no football-data.org requirement, current version, health path, no phantom cron unless you actually create one).
12. **Stale GitHub Actions** (Server Check, debug, transition patches) should be disabled when convenient.
13. Confirm whether leftover Render env names from the 13 Nov backup (Supabase, odds API, sync secret, and so on) are still set and whether they can be removed.

## 8. Standing rules

These come from the owner. Follow them on every surface (Picks, Trends, follows, Weekend Bankers, promos, notifications, slips, admin).

### Odds ranges (hard rule)

Every pick or tip is inclusive of the bookmaker price, except where noted. A pick that is out of range on all books is not shown and not booked.

| Market | Allowed price |
| --- | --- |
| Win, and team to score 2+ | 1.20–1.49 |
| DNB and DC (1X / X2) | 1.20–1.33 |
| Over/Under 1.5 | 1.20–1.30 |
| Over/Under 2.5 | 1.20–1.49 |
| Over/Under 3.5 | 1.20–1.60 |
| GG / NG (BTTS) | 1.20–1.49 |
| Team to score over 0.5 | 1.18–1.30 |
| 1H over 0.5 | 1.18–1.25 |
| 1H over 1.5 | under 1.80 (code: max 1.80 exclusive) |
| 2H over 0.5 | 1.18–1.25 |
| DC 12 (home or away) | 1.18–1.25 |
| Exception | Up to **1.60** only when that team is **10/10** on that exact market **and** the opponent's record on the mirrored market is also **10/10**. An 80% "held" flag is not enough |

The implementation is `server/oddsRange.mjs` (`ODDS_RANGES`, `PERFECT_CEILING`, `validException`, `assertBookingRanges`). Keep this table and that file in sync.

### Product and process rules

- No dummy or simulated data, and no SofaScore branding or scraping. `DATA_MODE=demo` is not allowed on the production server.
- QC must use real live data and screenshots before any APK. No new APK until known issues are fixed and verified live.
- Never show SportyBet as an odds or info **source** in the UI (the source label is Betspapa fixtures). Official bookmaker logos on booking cards are fine. Implementers may name SportyBet in internal docs and feed URLs.
- Book only on the no-login Ghana share endpoints: SportyBet, Football.com, MSport, Betika, betPawa. Skip Betway. Never invent codes. Never trigger Predict2u's job.
- Codes book in parts. The owner asked for 50 legs per code where a desk allows it, with a smaller last part if needed, and a **separate copy button on each code** (copy one code, not the whole list). Code limits in `server/bookers.mjs` (`DESK_MAX`): SportyBet 50, Football.com 50, MSport 30, Betika 20, betPawa 20. Do not pretend a desk accepted more than it can hold.
- Use real club crests (the 0.4.1 style), never initials badges as the intended design.
- Design changes need mockups and the owner's approval before building.
- Merge ready PRs with the merge method, without asking.
- Promos: approve-first switch starts on; nothing goes to all users until the owner has seen and approved it.
- Notifications must work outside the app (FCM + device permissions / OEM autostart guidance).
- Every charge needs a yes in chat.
- Never print secrets in chat.
- Work lean. The owner dislikes friction.

## 9. Step-by-step: build, deploy, and APK

### Local website + API

You need Node 20 or newer.

```bash
git clone https://github.com/OriginalSolution/Betspapa.git
cd Betspapa
git checkout main
npm install
# Optional: copy .env.example to .env. Leave DATA_MODE unset or live. Never use demo against production habits.
npm run dev     # Vite :5173 and the API together
# or
npm test
npm run build
npm start       # serves the built app and the API on 0.0.0.0:$PORT (8787 locally)
```

Point the app at a local API or at `https://api.betspapa.com` as appropriate. Do not book against live desks as a load test; booking writes real share codes.

### Deploy the API (Render)

1. Land the change on `main` (merge method if it is a PR).
2. Wait for CI (`.github/workflows/ci.yml`) and for Render auto-deploy of `srv-dbr5crdckfvc73d8i51g`.
3. Confirm https://api.betspapa.com/api/health (`ok`, `mode: live`, `guardian: ok`, `push: true` once FCM is configured) and https://api.betspapa.com/api/engine (codes present on the five desks, legs inside the odds table, kicked-off legs removed).
4. GitHub Pages will also rebuild from the same `main` push. Confirm https://betspapa.com/.
5. Only trigger a manual Render deploy if auto-deploy did not run. A deploy hook belongs in `RENDER_DEPLOY_HOOK` once that secret exists. Do not create new paid services.

To change env vars, use the Render dashboard or the Render MCP `update_environment_variables` tool with names only in chat. After the disk exists, set `ENGINE_DATA_DIR` to the mount path before relying on notifications.

### Signed Android APK

You need Node 20+, JDK 21, and Android SDK 36. Point `ANDROID_HOME` at the SDK.

```bash
npm install
echo "sdk.dir=$ANDROID_HOME" > android/local.properties
npm run android:apk
```

The signed APK is `android/app/build/outputs/apk/release/app-release.apk`.

`npm run icons` redraws web icons and the Android launcher/splash from the same mark.

Bump `versionName` and `versionCode` in `android/app/build.gradle` for each store-or-sideload release (`0.4.8` is 30; the next published build should be `0.4.9` / 31 if that draft is the one you ship).

QC on a real board with screenshots, including Picks codes, tab speed, and a closed-app notification, then create the GitHub Release and attach `app-release.apk`. Do not publish a draft until the owner-facing checklist in §7 is done. The current 0.4.9 draft is already sitting unpublished for that reason.

Sideload signing values are public on purpose and are listed in the README Signing section (alias `betspapa`; store and key passwords are the same public value documented there). Do not reuse that keystore for a Play Console listing.

### Admin and a push test

- Open https://api.betspapa.com/admin and sign in with `ADMIN_EMAIL` / the password from the secrets folder (not from git).
- `POST /api/devices/test` with `{ "token" }` or `{ "latest": true }` sends one data-only FCM message. Optional `kind`: `goal`, `kickoff`, `win`, `red`, `var`, `penalty`. The process log records the FCM name or error; it must never log the service-account key or the access token.

### Booking behaviour (for testers)

Tiers 100 / 90 / 80 (and per-market splits such as `tier:100:dc-12`) each get their own slip, split into parts that respect `DESK_MAX`. The engine stores only a code a desk actually returned. Out-of-range or kicked-off legs stay off the codes and off the pick lists.

## 10. Repo visibility and document hygiene

The repository is **public**. Assume anything committed is world-readable, including this file, the sideload keystore, `google-services.json`, QC screenshots, and the `engine-data` board snapshot.

Do not commit: admin passwords or hashes, FCM service-account JSON, Render env files, GitHub tokens, deploy hooks, Gmail app passwords, or card details. If you add a secret, put it in Render env, GitHub Actions secrets, or `/home/box/secrets/betspapa-*`, and only name it here.

When you finish a major change, update this hand-off (date it, and adjust current state, open items, and version numbers) so the next account is not reading a stale board.

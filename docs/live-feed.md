# Live feed events

Checked against SportyBet on 13 Nov 2026.

The phone and the server both read:

- `https://www.sportybet.com/api/gh/factsCenter/liveOrPrematchEvents?sportId=sr:sport:1`
- `https://www.sportybet.com/api/gh/factsCenter/event?eventId=…`

Those payloads include `matchStatus`, `setScore`, `gameScore`, `playedSeconds`, and markets. They do **not** include `timeline`, `incidents`, `comments`, or `varReview`.

| Event | How it is detected |
| --- | --- |
| Kick-off | Status moves from scheduled to live or half-time |
| Goal | Score increases |
| Half-time | `matchStatus` becomes HT |
| Full-time | `matchStatus` becomes FT / ended |
| Red card | Only if a timeline or incident row says red / second yellow |
| VAR | Only if `varReview` or a VAR incident is present |
| Penalty | Only if a timeline or incident row says penalty |

The parsers already accept those rows. Until the feed sends them, red cards, VAR checks, and penalties cannot be raised from a live match. The Settings test buttons still post those sounds.

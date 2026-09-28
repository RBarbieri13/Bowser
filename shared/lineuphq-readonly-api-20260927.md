# LineupHQ read-only API contracts — 2026-09-27

## Schedule

`GET /api/v1/schedule?season=2026&week=1,2`

Supports seasons 2025 and 2026, with the existing API default of 2025. `week` accepts one or more comma-separated NFL weeks 1–22 (the `weeks` alias is also supported); omission returns the season. Results are unique warehouse games ordered by week/date/time/game ID.

Response: `{data, meta}`. Each game has `gameId`, `season`, `week`, `seasonType`, `homeTeam`, `awayTeam`, `gameday`, `gametime`, `timeZone`, `kickoffUtc`, `homeScore`, `awayScore`, `totalPoints`. `timeZone` is America/New_York; `kickoffUtc` is nullable when the warehouse has no UTC field. Total points are the sum of two available actual scores, never betting totals or projections. `meta` contains `season`, selected `weeks`, `count`, `source`, and `linesAvailable:false`.

Vite, Vercel and the Express production server share this query. Sites remains the existing assets-only package; it has no warehouse API runtime.

## Private Yahoo league research

`GET /api/v1/yahoo?action=league-research&season=2026&team=<owned-team-key>&include=availability,trades,transactions`

The `/api/v1/auth/yahoo/league-research` route is equivalent. The existing encrypted eight-hour browser session is required. The selected team must belong to the signed-in user's NFL teams for the season; the league is derived from that team and verified against Yahoo. Existing dashboard contracts are unchanged. All success and error responses retain browser/CDN `no-store`; data is never written or logged.

The response contains `season`, `teamKey`, `leagueKey`, `availability`, `trades`, `transactions`, `errors`, `checkedAt`. An omitted or failed section is null; a failed section also has an `errors` entry. Authentication/permission/rate-limit failures abort the response. Calls are sequential.

- `include` defaults to `availability,trades` and supports those two values plus `transactions`.
- `availabilityStart` is an integer 0–5000, default 0. A request loads at most 25 players. `availabilityStatus` is `FA` (default, free agents only), `W` (waivers only), or `A` (all available players). The section returns `status`, `players`, `start`, `pageSize`, `exhausted`, `complete`, `nextStart`, `limitReached`, `coverage`. `complete` is true only when a single first page exhausts the pool. A client accumulating pages may establish full coverage only after an unbroken sequence from zero reaches `exhausted:true`. Missing players on a partial page must not be called rostered. Pool changes between calls can affect pagination.
- `trades` requests pending trades for the selected owned team. `transactions` requests recent league adds, drops and completed trades; it excludes private pending claims. Each returns `items`, `limit:50`, `complete`, `limitReached`, `coverage`. At exactly 50 items, completeness is false. No undocumented transaction pagination is attempted.
- Player identity fields: `key`, `name`, `position`, `team`, `status`, `statusDetail`. Yahoo keys differ from nflverse GSIS identifiers; joins must remain conservative.
- Transaction fields: `key`, `type`, `status`, `timestamp` (Yahoo epoch seconds or null), `traderTeamKey`, `tradeeTeamKey`, `players`. Transaction players add `action`, `sourceTeamKey`, `destinationTeamKey`. Missing transfer teams remain null. Trade notes, managers, contact details, tokens and raw provider payloads are excluded. No trade values, odds, or win probabilities are computed.

Provider resource/filter definitions were checked against [Yahoo's official Fantasy Sports documentation](https://sports.yahoo.com/developer/docs/), especially Players and Transactions collections. Automated fixtures verify normalization and privacy; they are not evidence of live account access.

# Bowser

Bowser is a fantasy-football research and analysis application. Its first production slice serves a fast, read-only 2025 NFL player-statistics table backed by SQLite. It mirrors the supplied desktop reference, supports exact regular- and postseason week ranges, opens source-backed player cards, supports mobile horizontal browsing, and keeps DraftKings pricing visibly unavailable until a licensed source is added.

The repository includes the application, the pinned local data warehouse, source snapshots needed to rebuild it, automated tests, and the Vercel deployment configuration. Generated dependencies and build output are intentionally excluded from Git.

## Run locally

```bash
npm install
npm run data:import
npm run dev
```

The local app and its same-origin JSON API are served by Vite. The database is opened read-only by the API.

For a standalone local production run, `server.mjs` serves the built React client and the same read-only API from one Express application. Run `npm run build && npm run serve` to exercise that shape locally. On Vercel, the identical client is served statically while `api/v1/` exposes the same packaged SQLite query layer through Node functions.

## Production

The standalone production deployment is available at [bowser-fantasy-football.vercel.app](https://bowser-fantasy-football.vercel.app). The Vercel project is named `bowser-fantasy-football`, is publicly accessible without Vercel authentication, and deploys from the canonical GitHub repository. Deployment evidence is recorded in [`deployment.json`](deployment.json).

The canonical source repository is [RBarbieri13/Bowser](https://github.com/RBarbieri13/Bowser).

## Verify

```bash
npm run check
```

The check covers SQLite integrity and foreign keys, the pinned 2025 nflverse row/player totals, all 18 regular-season and four postseason weeks, 100% snap matching for the 5,630 relevant offensive player-games, scoring arithmetic, API filtering/sorting, automated UI interactions, query latency, the production build, and static-host packaging.

## Data flow

```text
nflverse schedules, player stats, snaps, and play-by-play -> local source cache
                     -> SQLite player-week and game-flow warehouse
                     -> read-only Node API -> React research tables
```

- `scripts/import_nflverse_2025.py` downloads or reuses the pinned source assets and replaces the database atomically only after reconciliation checks pass.
- `data/fantasy_football.sqlite` contains 7,525 player-week rows for 609 players plus all 285 games, quarter scoring, team play mix, score-state timing, and 3,777 scoring timeline events from the 2025 season and postseason. Rows with a relevant statistic are augmented with every available offensive snap row for those players, so games played and snap totals remain complete.
- `server/stats-store.mjs` validates query inputs and performs aggregation, filtering, ranking, and sorting in SQLite.
- `src/App.jsx` renders the interactive table. Fantasy points are selected-period totals; DraftKings price is intentionally an em dash in this phase.
- `src/WeekRangePicker.jsx` selects any inclusive range from Week 1 through the Super Bowl and applies it immediately.
- `src/PlayerProfile.jsx` renders player identity, per-game performance, 2025 season totals, and team production-order depth context from the same warehouse.
- `server.mjs` is the standalone local production entry point; `api/v1/` contains the Vercel production functions that package the SQLite snapshot.

## API

- `GET /api/v1/meta`
- `GET /api/v1/player-stats`
- `GET /api/v1/player-profile?playerId=<id>&scoring=PPR`
- `GET /api/v1/team-box-scores?team=NYG&weeks=4,5,6,7&scoring=ppr&seasonType=ALL`
- `GET /api/v1/game-breakdown?gameId=2025_08_NYG_PHI&scoring=ppr`

Player queries accept `seasonType`, `scoring`, `positions`, `teams`, `weeks`, `search`, `sort`, `direction`, `limit`, `minGames`, `minSnaps`, and `ranks`. `sort` and `direction` accept up to three comma-separated fields for secondary ordering; `limit=all` exposes the complete 609-player warehouse.

Player profiles return 2025 regular- and postseason game logs (including quarterback sacks suffered), a season aggregate, weekly and season positional finishes, and the selected player's teammates grouped by offensive fantasy position. The league-membership field remains explicitly unavailable until league roster data is connected.

Team box-score responses include the selected team's full schedule with stable game IDs, opponent, home/away status, kickoff date and Eastern time, final score, and result. Game breakdowns return both teams' fantasy box scores, scoring by quarter, score-over-time events, time leading/trailing/tied, run/pass play mix, and offensive scrimmage-play totals. Each response includes source availability and calculation methodology so a missing nflverse artifact is shown explicitly rather than fabricated.

Data: [nflverse](https://github.com/nflverse/nflverse-data), licensed under CC BY 4.0. Snap counts are distributed by nflverse from Pro Football Reference data.

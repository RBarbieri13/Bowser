# Bowser

Bowser is a fantasy-football research and analysis application. Its first production slice serves a fast, read-only 2025 NFL player-statistics table backed by SQLite. It mirrors the supplied desktop reference, supports mobile horizontal browsing, and keeps DraftKings pricing visibly unavailable until a licensed source is added.

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

The standalone production deployment is available at [fantasy-football-stats-preview.vercel.app](https://fantasy-football-stats-preview.vercel.app). The existing Vercel project slug remains a neutral technical identifier for Bowser. Deployment evidence is recorded in [`deployment.json`](deployment.json).

The canonical source repository is [RBarbieri13/Bowser](https://github.com/RBarbieri13/Bowser).

## Verify

```bash
npm run check
```

The check covers SQLite integrity and foreign keys, the pinned 2025 nflverse row/player totals, all 18 regular-season and four postseason weeks, 100% snap matching for the 5,630 relevant offensive player-games, scoring arithmetic, API filtering/sorting, automated UI interactions, query latency, the production build, and static-host packaging.

## Data flow

```text
nflverse release CSVs -> immutable local cache -> idempotent importer
                     -> SQLite player-week warehouse -> read-only Node API
                     -> React statistics table
```

- `scripts/import_nflverse_2025.py` downloads or reuses the pinned source assets and replaces the database atomically only after reconciliation checks pass.
- `data/fantasy_football.sqlite` contains 7,525 player-week rows for 609 players. Rows with a relevant statistic are augmented with every available offensive snap row for those players, so games played and snap totals remain complete.
- `server/stats-store.mjs` validates query inputs and performs aggregation, filtering, ranking, and sorting in SQLite.
- `src/App.jsx` renders the interactive table. DraftKings price is intentionally an em dash in this phase.
- `server.mjs` is the standalone local production entry point; `api/v1/` contains the Vercel production functions that package the SQLite snapshot.

## API

- `GET /api/v1/meta`
- `GET /api/v1/player-stats`

Player queries accept `seasonType`, `scoring`, `positions`, `teams`, `weeks`, `search`, `sort`, `direction`, `limit`, `minGames`, `minSnaps`, and `ranks`. `sort` and `direction` accept up to three comma-separated fields for secondary ordering; `limit=all` exposes the complete 609-player warehouse.

Data: [nflverse](https://github.com/nflverse/nflverse-data), licensed under CC BY 4.0. Snap counts are distributed by nflverse from Pro Football Reference data.

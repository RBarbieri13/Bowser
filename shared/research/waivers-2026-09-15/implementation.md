# Bowser Waivers and 2026 Week 1 implementation

Prepared September 15, 2026. Cross-league research; no league roster or scoring assumptions are imposed on publisher recommendations.

## Implemented

- `/\#/waivers`: one dense table with sticky name/position/team, five positional priority columns, six publisher FAAB columns, Sleeper adds/drops, ESPN roster/start percentages, usage, passing, rushing, receiving, per-game trends, and selected-week cumulative fantasy points.
- Independent waiver-edition and statistics-week controls; PPR, half-PPR and standard statistical scoring; search, position/team/source ranges, multi-sort, column visibility/width, group collapse, density and Auto Fit.
- Browser-local favorites scoped by season and waiver week, personal dollar bids (including zero), notes, and a collapsible right drawer. No waiver claim is submitted.
- Separate 2026 warehouse with all 16 completed Week 1 games; current season is the app default, while 2025 remains selectable. Player profiles, team box scores, game breakdowns and Opportunity Tracker request the selected season.

## Data and interpretation

The September 15 capture has 101 targets, 163 source ranking cells across five publishers and 135 FAAB cells across six publishers. See [exact source coverage and importer constraints](import-report.md). Eighty-four targets join recorded Week 1 statistics; unplayed players and team defenses remain visible with unknown statistics.

Published overall ranks are converted to within-position ordinals with the original rank and method retained. FantasyPros supplies only its public five-row preview. Source ranks, budgets and denominators are not interchangeable. Annual, remaining and unspecified budget bases remain separate; unknown bases stay in native units. No synthetic consensus, player popularity score, demonstration rankings or fabricated bids are included.

Source recommendations are a dated imported snapshot. Refresh in the page reloads that snapshot and refreshes public popularity through the existing cache; it does not scrape new editorial recommendations. Updating recommendations requires the validated `npm run data:waivers` import and a release. This importer is scoped to the verified 2026 Week 2 edition; future editions need separately verified URLs and parsers. No scheduled refresh has been installed.

Stats currently include Week 1 only. The week range and sums support additional recorded weeks, but future weeks are not fabricated. Full play-level personnel participation has not been published for 2026, so segment snaps are unknown while weekly snaps and real play-by-play opportunities remain usable. The original 2025 SQLite file remains byte-identical.

## Verification and release gate

`npm run check` covers both warehouse verifiers, all backend/UI/importer checks, the standalone production server and Sites packaging. The waiver verifier enforces five actual rank and five actual FAAB sources, validates numbers, identity joins, budget context and atomic import behavior. Browser verification covers the integrated real table, filtering/sorting, 35-pixel rows, current-season player cards, source limitations, and favorites/bids/notes after reload. Fresh independent verifier outputs and public-release evidence are retained under the ignored `.graph-session/waivers-build-2026/` directory.

Permanent deployment target: https://fantasy-football-stats-preview.vercel.app/#/waivers. Deployment is complete only after branch/PR merge and live API/browser readback; this implementation record alone is not deployment proof.

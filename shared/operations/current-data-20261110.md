# Bowser current-data release — November 10, 2026

As-of day: November 10, America/Chicago. UTC source captures extend into November 11.

## Verified public inputs

- NFL: all 136 completed games through Week 9; 3093 player-stat rows. nflverse importer and warehouse verifier pass. Immutable 2025 warehouse SHA-256: `d3cc2ed8e38eaca00005b4facb2e475c833418302b4b2c367c42574412dd1869`.
- Waivers: Week 10, 108 players, five actual ranking publishers and five actual FAAB publishers. Capture: 2026-11-11T04:02:46.328682+00:00. Seven publishers total; PlayerProfiler adds dollar ranges for a $100 reference, retaining PPR/six-point passing-TD and bench-depth context. No article-order ranking is inferred. Historical editions remain unchanged.
- CBS extraction checks retain Higbee's at-least 5% remaining-budget bid and Beck's at-least 10% Superflex/two-QB restriction. Ambiguous cross-player bids are unavailable. NFL conditional priorities retain their conditions, including the morning Taylor-trade assumption; current news reports he remained with Indianapolis.
- DFS: 13 verified Week 10 official DraftKings slates; 3142 salary/role entries. Primary projections fail player/team identity coverage following deadline moves; the supplemental schedule does not match. Explicit salary-only mode rejects the entire invalid primary feed, retains projections as null and labels provider reasons. Historical projections are not substituted.
- All 125 pre-existing slate objects, 473 capture rows and 102,355 historical salary rows were compared and preserved exactly. SQLite page compaction changes physical packing only; every historical row is unchanged.
- Market Pulse: live Sleeper, ESPN and Yahoo-wide public feeds checked. 29 current ESPN article/player references captured at 2026-11-11T04:04:17.975Z. New items are unclassified; original Jev history/clocks remain unchanged. No Jev key is configured, so no model classifications or confidence values are invented. Source-only news and model history remain distinct.
- Fantasy News: a separately validated repository snapshot appends seven current ESPN deadline/injury reports while preserving all 86 older events and their original source clocks.

## Release gates

- `npm run check`: PASS, including current/historical warehouse validation, server/UI, market, waiver, DFS, production and Sites tests.
- `npm run lint`: PASS.
- Independent read-only verification: PASS after correcting CBS subject/tier extraction.
- Chrome local readback: Week 10 waiver defaults, source counts, current Market Pulse public feeds and reload persistence verified; no JavaScript errors.
- Candidate deployment, exact reviewed-head merge and permanent-alias readbacks are required before declaring production complete. Their results are recorded in the PR and final release evidence.

Private Yahoo data, browser credentials and environment files are excluded from this release. Source capture evidence and test logs remain under ignored `artifacts/current-20261110/`.

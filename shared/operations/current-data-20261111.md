# Bowser public data refresh — November 11, 2026

This data-only refresh starts from verified main `3ee6fc5137a25eab65038ba8d6dfc17829a9120a` and permanent deployment `dpl_EUy7vnGaThqJb73DW8KfpSXrZwHX`. It preserves application code, independent statistics/DFS windows, private ownership boundaries and all historical captures.

## Independent feed results

- **NFL — changed, verified:** official nflverse corrections, roster/depth and schedule source updates; 136 completed games and 3,093 player-stat rows through Week 9. Week 10 has 14 scheduled games and no fabricated actuals. Import completed November 11 at 15:53:55 UTC; warehouse verification passed. Raw source hashes changed for player statistics, play-by-play, roster, depth charts and schedule. These are sourced observations, not manual post-trade roster corrections.
- **DFS — changed, verified:** 2026 Week 10; four Classic and nine full-game Showdown slates, 3,142 official salary/role entries. All-week Classic default `2026-w10-dk-156415` has 718 salaries and 167 verified Fantasy Info Central projections, source date `2026-11-11T07:41:01Z`. Supplemental Fantasy Sports Central columns changed and that optional provider remains explicitly unavailable. The strict importer returned `publishable:true`; no partial-projection override was used. FLEX/CPT prices remain separate and Captain points retain explicit 1.5× derivation. Missing projections remain null.
- **Waivers — held, last verified edition retained:** fresh Week 10 captures passed five rank/five FAAB publisher counts, but independent identity review found a source conflict. The November 11 RotoBaller midweek article describes Cousins in Minnesota and Allen in San Francisco while the fetched nflverse registry/roster still lists LV/IND. The candidate’s fallback team labels therefore cannot be published as refreshed identities. The Week 10 snapshot captured `2026-11-11T04:02:46.328682+00:00` is retained byte-for-byte; no research timestamp was advanced. Held captures and the candidate remain only in ignored public evidence. Other verified feeds continue independently under the SOP.

## Historical preservation and gates

The immutable 2025 warehouse retains SHA-256 `d3cc2ed8e38eaca00005b4facb2e475c833418302b4b2c367c42574412dd1869`. All 125 pre-Week-10 slate objects are identical. SQL comparison preserves all 486 existing capture rows and 105,497 salary rows; the archive now contains 499 captures and 108,639 salary rows. Earlier waiver editions are unchanged.

Importer/offline checks, full `npm run check`, lint and independent read-only review pass on the final feed selection. Candidate verification, exact-head PR merge and both permanent URL readbacks remain release gates; results belong in the PR and ignored `artifacts/daily-refresh-20261111/` evidence. No private Yahoo data, reports, environment secrets or credentials were read or persisted by this refresh.

GitHub’s 100 MiB file gate required SQLite page compaction: the archive shrank from 105,644,032 to 104,562,688 bytes. Integrity and SQL history comparisons passed afterward; no capture, salary, projection or source observation changed.

# Complete Week 3 and upcoming Week 4 waiver refresh

Captured September 29, 2026 (America/Chicago); UTC capture dates are retained in the data.

- nflverse: all 16 games in each of Weeks 1–3, 48 total; 1,097 offensive player-stat rows and 1,273 snap rows. Monday PHI at CHI is included. All source player values and snaps are checked against the downloaded CSVs, plus full-team/game completeness.
- All statistics-backed pages, profiles and aligned trends use the refreshed 2026 warehouse. Player Database already defaults to the latest imported week; Opportunity Tracker now does too. The 2025 warehouse remains byte-identical.
- Waivers defaults to the newest published research (Week 4) and latest completed prior statistics (Week 3). Explicit statistical ranges remain independent. Only published research weeks appear in the selector; Week 2 research remains available. Favorites are isolated by season and waiver week.
- Week 4 snapshot: 106 targets, 93 individual players matched to the nflverse registry, 13 team defenses; 181 rank cells across five sources, 112 primary bid cells across six sources. Missing cells remain unavailable. No Yahoo private data was accessed or saved.

## Sources and interpretation

Each record in `data/waivers-2026-week4.json` retains direct publisher URLs, publication/capture dates and HTML hashes. Raw publisher HTML is retained only under ignored `artifacts/waivers-week4/`, not republished. Run the pinned parser with its original capture timestamp for reproducibility; a future rolling dateline requires deliberate review.

| Publisher | Ranking cells | FAAB cells | Interpretation |
|---|---:|---:|---|
| FantasyPros | 5 | 31 | Public five-row PPR consensus preview; article dollar bids reference $100, budget basis unspecified |
| RotoBaller | 85 | 19 | Numeric overall waiver priority; base bids and separately labeled alternatives |
| Footballguys | 0 | 6 | Annual-budget percentages |
| RotoWire | 0 | 16 | Public bids with league-depth tier; grouped Kirk/Cooks bid split per player |
| CBS Sports | 29 | 25 | Explicit positional priority cards; source operators and remaining/unspecified budgets retained |
| DraftSharks | 0 | 15 | Bid tiers only; current article does not establish numeric rank order |
| NFL | 15 | 0 | Explicit overall priority; Raymond's omitted position matched to the player registry |
| Blitz Sports Media | 47 | 0 | Explicit waiver table; original overall rank retained |

Overall priorities are converted to within-position ordinals, with the original overall value retained. Different publisher populations and budget bases are not interchangeable consensus recommendations. CBS Wright (10–15%, unspecified basis) is distinct from Gordon (up to 15% remaining). Superflex-only CBS backup-QB bids are excluded; RotoBaller superflex alternatives are kept separately from base values.

## DFS limitation

The scheduled DFS importer was run and failed closed: `Projection source date outside current pregame week`; `changed:false`, `publishable:false`, `lastGoodPreserved:true`. No DFS snapshot, salary, projection or archive changed or was deployed. This release separately publishes verified actual statistics and waiver research. The last sourced DFS capture remains Week 2. Upcoming uncaptured DFS weeks remain unavailable. The statistical base week remains independent of selected historical DFS slate.

## Verification

- `npm run check`: required before push; includes both waiver snapshots and Week 4 scope/numeric/context tests.
- `verify_week3_release.py`: independent HTTP comparison of every Week 1–3 counting statistic, snap and PPR value against the source-verified warehouse; exact waiver rank/bid payloads; Monday readback in Team Box and Opportunity; historical waiver retention.
- Existing trend/DFS and independent statistics/DFS-window release verifiers remain intact.
- Browser: Waivers opens W4 / statistics W3, eight source publishers, 106 targets. Kalif Raymond displays 54 snaps, 21 PPR and WR7 after Monday; source bids and ranks retain their labels. Sidebar remains hidden.

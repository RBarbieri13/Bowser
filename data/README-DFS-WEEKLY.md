# Weekly DraftKings data

`data/dfs-weekly.json` is the atomic, verified collection of dated weekly Classic and full-game Showdown slates. `data/dfs-week1-2026.json` and the pinned `scripts/import_dfs_week1.py` remain historical and unchanged. The application resolves `current` to the verified weekly default and keeps the `week1` and `main` aliases attached to the original Week 1 slates.

## Refresh and verify

```sh
python3 scripts/import_dfs_weekly.py
python3 scripts/import_dfs_weekly.py --verify
python3 tests/test_dfs_weekly_import.py
node --test tests/dfs-weekly.test.mjs
npm run check
```

`--dry-run` fetches and validates all sources but never replaces the snapshot. `--output PATH` allows an isolated candidate; `--raw-dir PATH` selects the raw evidence directory. By default evidence is saved under ignored `artifacts/dfs-weekly/<UTC capture>/`. The stdout report is JSON. A process lock prevents overlapping refreshes of the same target.

| Exit | Status | Data action | Automation action |
| --- | --- | --- | --- |
| 0 | `updated`, `changed:true`, `written:true`, `publishable:true` | Atomically replaced after every slate passes | Run the complete application checks, then publish only under the authorized release workflow |
| 0 | `unchanged`, `changed:false` | No rewrite; preserves identical bytes/capture provenance | Stop; do not deploy |
| 0 | dry run or `verified` | No refresh publication | Do not deploy on these reports alone |
| 3 | `partial`, `publishable:false` | Preserve last good file byte-for-byte | Stop; report reason and retry on a later authorized run |
| 4 | `no-data`, `publishable:false` | Preserve last good file | Stop; offseason/locked or unpublished slate, no deployment |
| 1 | `failed`, `publishable:false` | Preserve last good file | Stop; investigate transport/runtime failure |

A scheduler should require all three `changed`, `written`, and `publishable` flags to be true, then run verification and the complete application checks. Exit 0 alone is not a deployment signal. This importer does not create schedules, commit, push or deploy.

## Discovery and source boundaries

- **NFL calendar:** [nflverse schedule](https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv). The season/week comes from schedule rows, including January games in the prior NFL season. Choose the first week whose final kickoff plus four hours has not elapsed and whose first kickoff is at most eight days away. No calendar-year or ISO-week guesses.
- **Official slate discovery:** [DraftKings NFL public lobby](https://www.draftkings.com/lobby/getcontests?sport=NFL). Require NFL and either Classic (`ContestTypeId=21`, `GameTypeId=1`) or full-game Showdown (`ContestTypeId=96`, `GameTypeId=96`), plus complete game-set metadata, matching game count, kickoff, opponents and NFL calendar week. The alternate `api.draftkings.com/draftgroups/v1/` endpoint returned 403 on September 16, 2026; the importer uses the accessible official lobby instead.
- **Official salaries:** `https://www.draftkings.com/lineup/getavailableplayerscsv?draftGroupId=<discovered ID>`. Validate every salary row's teams, date, time and Classic roster position against its discovered game. Require every team/position and the established minimum 40 rows per game. Same-group salary population shrinkage is rejected for review. Showdown retains both official FLEX and CPT records with distinct DraftKings IDs; validates identical player populations, both teams and all positions including K/DEF, and checks CPT salary equals 1.5× FLEX. At least 40 distinct players per full-game Showdown must be present. No role or format salary substitution.
- **Projections:** [Fantasy Info Central DraftKings](https://www.fantasyinfocentral.com/nfl/dfs/projections/draftkings). Require its explicit season/week title and projected DraftKings points column, a Last-Modified date inside the pregame week and no more than 72 hours old, and the exact scheduled opponent/day/kickoff for every row. Never use DraftKings `AvgPointsPerGame` or historical production as a projection.
- **Identity:** [nflverse season roster](https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_2026.csv) (the year is discovered). Require all 32 teams and a current/previous week roster. Join only a unique normalized name, position and current team to a GSIS ID, including rookies. Bundled nflverse name aliases can only resolve to an ID already present on that current roster/team. Ambiguous and unmatched identities remain null; they are retained in the snapshot but excluded from warehouse joins.

Every slate stores source URL, resolved URL, retrieval time, HTTP Last-Modified/Date when supplied, response byte count and SHA-256. Every projected row stores provider, URL, source date, season, week and game ID. Source capture dates and provider update dates are distinct. Original retrieval time of bundled name aliases is unknown and explicitly null.

## Coverage and missing data

On September 16, 2026 FIC published 192 offensive Week 2 rows: six per NFL team. It is a limited player projection feed. Every scheduled team must have at least one QB, RB, WR and TE projection, and **every** source row for teams in a slate must match an official salary row. These are football coverage and join integrity gates, not an arbitrary global count inherited from another provider/week. Missing backups, defenses and any other unprovided projections stay null with an explicit reason.

Shark Snip was inspected as a possible supplement. Its September 16 page identified Main draft group 153428 correctly, but served only 26 defense projections out of its stated 524-player pool. It is not used in the new importer; historical Week 1 projections retain their original provenance.

Historical September 16 Week 2 capture (retained):

| Draft group | Slate | Games | Official salaries | Current roster matches | Projections |
| --- | --- | ---: | ---: | ---: | ---: |
| 153427 | All-week Classic, Sep 17–21 | 16 | 812 | 752 | 192 |
| 153430 | Sun–Mon, Sep 20–21 | 15 | 765 | 710 | 180 |
| 153428 | Sunday Main, Sep 20 | 13 | 664 | 615 | 156 |
| 153429 | Early Only, Sep 20 | 8 | 406 | 373 | 96 |
| 153431 | Afternoon Only, Sep 20 | 5 | 256 | 242 | 60 |
| 153432 | Afternoon Turbo, Sep 20 | 3 | 153 | 144 | 36 |

Current default is the largest verified slate in the scheduled week. Locked contests are not refreshed with later projections; their prior verified snapshots remain selectable. All prior dated slates are retained. If a newer week is incomplete, source requests fail, or no unlocked supported slate is available, the previous file is unchanged. The app clearly dates the last-good fallback rather than relabeling old data as the new week.

The runtime serves only snapshots marked verified. A missing or malformed weekly file falls back to the original dated Week 1 archive. A real source transition requires a parser update and validation, not weaker coverage thresholds.


## September 17 Thursday-only support

Official group [153434 salary CSV](https://www.draftkings.com/lineup/getavailableplayerscsv?draftGroupId=153434) is **DET at BUF, September 17, 2026, 8:15 PM ET**, full-game Showdown Captain Mode. It is not a one-game Classic slate. The snapshot contains 94 entries: 47 FLEX players and the matching 47 CPT entries. Twenty-two players have sourced projections, stored for each role; missing player, kicker and defense projections remain null.

Select `2026-w2-dk-153434` for FLEX, or `2026-w2-dk-153434:cpt` for Captain. The runtime filters the role before joining player identities, preventing duplicate player rows. Archived exact lookup accepts `slateId=153434&rosterPosition=FLEX` or `CPT`. Weekly default and exact-week lookups without a specific slate remain Classic.

Full-game offensive DraftKings point projections are sourced from FIC, then supplemented only by FSC rows that first match a verified official same-week Classic salary. The supplemental validation slate ID, CSV URL and response hash are retained. These are sourced full-game projections, not independent Showdown-specific models. FLEX uses the source value; CPT explicitly derives source points × 1.5 under [DraftKings Captain scoring rules](https://help.draftkings.com/hc/en-us/articles/24808583978003-Game-Style-Showdowns-Overview-US). Base value, multiplier, provider and rules URL remain inspectable. Official role salaries come directly from the Showdown CSV, not from scaled Classic prices.

This refresh imports all 16 published full-game Showdown groups for Week 2 alongside the six Classic groups. In-game, second-half, fourth-quarter, snake, Madden, and single-stat contests remain excluded because their scoring periods or roster semantics differ. All-week current coverage is 818 salaries and 393 projections; the September 16 812/398 capture remains available by ID. Removed provider rows become explicitly unavailable in the newest capture instead of retaining stale values under a new timestamp.

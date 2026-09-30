# Player Card v2 design QA

Date: 2026-08-26

Reference source: `Bowser Design System (3).zip`, using `PLAYER-CARD-V2-HANDOFF.md` and the five images in `handoff/images/`.

## Comparison setup

- Local route: `#/players`
- Reference player: James Cook, used only to align the visual state; every displayed value came from the local nflverse warehouse.
- Desktop comparison viewport: 1440 × 900 browser viewport, with the modal centered over the Player Database.
- Browser comparison states: Game Logs, Heat Map / Fantasy, Heat Map / Rushing, Season Stats, and Depth Chart.

## Visual acceptance

| State | Result | Evidence checked |
| --- | --- | --- |
| Hero and tabs | PASS | 1020px-class modal, BUF gradient, 84px portrait tile, chip row, FPTS/G summary, four-tab order, active-tab treatment, and close control match the reference structure and tokens. |
| Game Logs | PASS | Position-aware RB ledger, 96px trajectory chart, average line, FPTS-only judgment colors, postseason divider, summaries, and no horizontal table overflow at the desktop target. |
| Heat Map / Fantasy | PASS | Flat ledger, five specified metrics, single-green per-column scaling, group selector, and 0-to-best legend match the handoff. |
| Heat Map / Rushing | PASS | Four specified metrics and independent column scaling render from the same real game-log records. |
| Season Stats | PASS | One row per warehouse season, newest first, with all specified RB columns in one row and current-season emphasis. |
| Depth Chart | PASS | Four equal cards with reference-sized visible depth, real team production order, selected-player treatment, and live player navigation. |

## Corrections made during comparison

- Restored the exact tab-panel headings and the Game Logs season scope pill shown in the references.
- Applied the warning treatment to the unconnected My leagues chip.
- Limited the visible depth rows to the reference density while preserving the full warehouse response.
- Scoped Source Code Pro to every Player Card numeric value without changing the Player Database typography.
- Kept the modal height bounded with internal content scrolling for the complete real 2025 schedule.

## Functional and responsive checks

- PASS: all four tabs and both heat-map modes are keyboard-accessible and update in place.
- PASS: Escape, close button, backdrop click, focus trapping, focus-visible outlines, loading, empty, and error states are present.
- PASS: the modal becomes a full-height mobile sheet below the desktop breakpoint; wide ledgers scroll inside the panel rather than expanding the page.
- PASS: browser console produced no warnings or errors during the full tab walkthrough.
- PASS: reduced-motion handling disables the loading animation.


## LineupHQ application conversion — September 27, 2026

Reference: `Bowser Design System (4).zip`, `LINEUPHQ-APP-CONVERSION-HANDOFF.md`, the seven browser-opened `prototypes/` files, and all seven original `lhq-images/` images. The master reference resolves shared tokens. Player Card v2 remains unchanged.

### Comparison conditions and accepted overrides

Desktop DOM viewport 1920×1080, CSS zoom 1, Helvetica Neue/Helvetica/Arial. Saved high-resolution browser captures are in the local `.graph-session/bowser-lhq-20260927/screenshots/` evidence directory. Browser emulation compensates for the host browser's 80% scale; CSS dimensions were read back independently. All seven final route captures were inspected by a separate reviewer. Its complete three-pass report is [visual-review.md](shared/operations/lineuphq-conversion-20260927/visual-review.md).

Robert explicitly allows horizontal scrolling with the sidebar open, synchronized per-stat week resizing, and a sidebar as narrow as 240px or fully hidden. These replace the handoff's fixed three-week open-sidebar fit and 367px lower bound. Read-only schedule and Yahoo research endpoints were expressly authorized. Differences in players, totals, source capture dates and unavailable private account data reflect actual source data, never prototype sample rows.

| Route | Final comparison | Geometry and interaction evidence | Real-source boundary |
| --- | --- | --- | --- |
| Player Database | PASS | 29 default columns; 36px rows and two 36px header bands; grouped Manage Columns, trend visibility, row count, live sort context, pinned identity/fantasy columns, sidebar position totals with top-player identity | 410 recorded 2026 W1 players; independent DFS slate date; unavailable draft/DFS values remain missing |
| Waivers | PASS | Source-separated ranks and bids, grouped bands, range filters, favorite claim sidebar, native/percent/dollar modes; opaque sorted pinned FPTS header | 101 real targets; source budget basis and scoring retained; no fabricated conversion when basis unknown |
| Market Pulse | PASS | Combined provider table, matchup tiles, Most added sidebar, row limit/sort controls, source history and commentary inspection | Provider observations have separate capture dates; missing is not zero; stale retained snapshots explicitly labeled |
| Team Box Scores | PASS under user override | 36/22/36 header bands; 36px rows; 13px week data; QB532px/skill518px baseline week blocks; active per-week sort; anchored trends; marker filters | Historical actuals and exact-week DFS archives stay distinct; DNP/bye gaps and unknown totals preserved |
| Opportunity Tracker | PASS | 72px player rows; three editable metric charts; common calendar/scale; 90px centered signed movers bars; names no longer clipped | Same NFL calendar slots across players/seasons; at least two known observations per comparison side; injury practice feed unavailable is labeled |
| Yahoo Connection | PASS for empty/fixture states | Leagues/Rosters/Connection log; source-aligned percentage columns; connection steps and status/sidebar anatomy | Local configuration unavailable state is truthful. Private account behavior tested with test-only fixtures; live account read not claimed |
| League Hub | PASS for empty/fixture states | Decision queue, matchups, health matrix, waiver radar, trades and exposure windows; five-column full-width scope menu; collapsible sidebar | No sample-data switch or fallback. Current availability is paged and bounded; pending trades/current standings not misrepresented as historical |

### Shared behavior and measured readbacks

- Team menu opens at y=50px, spans the viewport's usable width (1901px with the native scrollbar), and uses eight columns. Escape dismisses it.
- Team SNP resized 36→40px in one header updated all 12 matching headers across three weeks and four position sections. Reversing the resize restored 36px. Stat widths are keyed by metric, independent of week.
- At 1920px with the sidebar hidden, all three default week blocks fit: grid clientWidth equals scrollWidth (1839px). With the 420px sidebar open, grid width is 1411px and content 1786px, providing internal horizontal scrolling. Document width stays contained.
- At 1000px, the sidebar automatically collapses and the document does not overflow horizontally; explicit user reopening remains possible. Initial narrow mounts also collapse saved-open state.
- Default ordinary rows measured 35.996px and Opportunity rows 71.992px (subpixel rounding). Header widths are explicit colgroups. Hover/zebra and opaque pinned sorted headers were compared visually.
- DESC-first sorting, nulls-last, shared resizing, metric/history selection, malformed persisted preferences, range filtering, source-native FAAB conversion, CSV provenance and private account isolation have focused regression coverage.
- Player links still open the unchanged warehouse-backed Player Card v2. No page chrome/grid reintroduces Poppins or Source Code Pro.

### Handoff §8 functionality coverage

1. Competition rank follows active sort context; weekly NFL position finish remains a separate source field.
2. Real schedule endpoint powers game tiles; implied totals are omitted without a lines source.
3. In-row trends use aligned history and common NFL domains.
4. Density preferences 30/32/36/40/44 and font multipliers implemented; Opportunity retains its specified 72px rows.
5. Search/Reset embedded in group headers.
6. Inclusive numeric ranges available on Player Database, Waivers and Market Pulse.
7. Native/percent/dollar FAAB chooser uses existing basis-aware conversion.
8. Favorites, local bid drafts/notes, committed totals and favorite-all-filtered implemented.
9. Waiver team tiles use available sourced market additions; unknown observations do not become zero.
10. Market matchup facets derive from joined provider rows.
11. Most added sorts actual observed adds, top ten.
12. Multi-week Team grid, hidden weeks, window navigation, judged medians and anchored trend placement implemented.
13. Team marker pools/counts retain local preference storage.
14. Opportunity deltas/averages retain aligned calendar gaps and minimum observation counts.
15. League Hub uses authorized Yahoo payloads and read-only owned-team research; unavailable fields are explicit.
16. Yahoo tabs and safe in-memory event log implemented.
17. Shared tooltip setting and field definitions implemented; source links/basis remain inspectable.
18. Shared sidebar drag, keyboard resize, accordion, hide/show, condense and responsive collapse implemented.

### Release gates

The independent visual review is PASS. Focused UI/privacy/data regressions are included in `npm run check`, not a separate optional suite. Production release evidence and final commit/deployment IDs are recorded in `shared/operations/lineuphq-conversion-20260927/` and `shared/operations/production-release.json` after candidate and permanent-URL verification. Missing historical DFS captures and live Yahoo authorization remain explicit data/access boundaries, not substituted sample records.

Hosting correction: the first candidate hit Vercel's twelve-function limit. The public schedule URL now rewrites to the existing metadata function; dedicated routing/read-only tests and a function-count guard pass. No plan, secrets or source data changed.

Final polish: Position Totals now reserves 40% for the top-player column and stacks the name and points without crowding; condensed sidebars scroll that summary internally. The final image was independently reviewed with PASS retained. A pre-existing randomized authentication test could replace an existing X with X (a 1-in-64 no-op); the test now guarantees a distinct tampered character before asserting rejection. Runtime authentication is unchanged.

## Compact research controls — September 28, 2026

Robert's follow-up replaces the earlier always-visible source/matchup bands and expanded-sidebar defaults. Typography and palette retain the existing LineupHQ contract.

| Surface | Verified change | Evidence |
| --- | --- | --- |
| All seven routes | Sidebar hidden on fresh navigation and reload; high-contrast 600-weight navigation with 800-weight active underline; independent sources/options collapse | Browser navigation through all routes; shared-shell regression |
| Player Database | One All/QB/RB/WR/TE/K/DST row, top Week(s)/Through selection, passing trend plus independent metric/history menus on all five charts | Browser menu interaction; per-column history and schedule request tests |
| Player → Team | Puka/LA shortcut transfers 2026, exact Weeks 1–3 and PPR | Browser URL and rendered week-header readback; exact query regression |
| Team Box Scores | Single three-band header, 30px data rows, 25px position toggles, shared QB passing / skill-position receiving slots, 3px week boundaries | Desktop browser screenshot and actual fixture values |
| Team widths | Whole-week proportional resize applies to all 13 fields across every week; identity remains unchanged; independent stat resize retained | Browser keyboard resize and pointer/keyboard regression tests |
| Team game links | Abbreviated dates with year, no kickoff time; separate comparison selection and original game-breakdown links | Link targets and date assertions |
| Legacy game view | Starts with collapsed icon rail; historical game ID retains the game's 2025 season; ordinary entry defaults to 2026 | Existing historical interaction suite selects 2025 explicitly |
| Responsive | No document overflow at approximately 320, 375, 414, 768px; tables scroll internally | Browser geometry readback |

Desktop checks used a measured 1920×1080 CSS viewport. Collapsing both header bands places the Player grid near y=182 and Team grid near y=193; grid height reclaims the space. Local screenshots are in the ignored `.graph-session/compact-controls-20260928/screenshots/` folder. Release evidence is in `shared/operations/compact-research-20260928/`.

No source statistics, API contracts, private Yahoo data, or DFS capture archives changed. Weeks without imported statistics remain unavailable, even when the real schedule and archived DFS salary exist.

## Contextual research workspaces — September 28, 2026

| Route / feature | Comparison and verification |
| --- | --- |
| Shared shell | Original full-resolution Bowser image rendered at 140px, no duplicate wordmark. Sidebars stay initially hidden, independent vertical scrolling and condensed width retained. |
| Player Database | Browser W1–2 Josh Allen: GP 2, 132 snaps, 582 passing yards, 5 passing TD, 76.5 PPR, QB1. Three aligned trend slots and an 18px independent hide/restore rail verified. Kickoff 1p / 4:25p in 58px. |
| Player research | Browser readback of Josh Allen totals, official Buffalo depth, full season schedule, W1 game stats. Player Card v2 unchanged. |
| DraftKings cards | Classic browser: Allen + McCaffrey = $15,400 used / $34,600 remaining; multiple saved cards persist by slate/capture. Showdown: Allen CPT + Gibbs FLEX = $29,100 used / $20,900 remaining; duplicate Allen FLEX rejected. Historic captures remain selectable. |
| Team Box Scores | Exact selected 2026 W2 Captain source: Allen $17,100 / 35.85 projection, W1 retains $7,000 / 20.3. Export and position totals use selected slate too. Added depth, playing-time, schedule, selected-player and lineup panels. |
| Waivers | Public positional-rank options with roster/start percentages; separate selectable depth panel, league roster/free agents/pickups/transactions. Three-week history retained. |
| Market Pulse | Provider-specific public projections, up to three discovered Yahoo league ownership marks, real returned Yahoo add/drop/net counts; explicit unknown and bounded coverage. No synthetic leagues. |
| Opportunity / League Hub / Yahoo | Shared logo and initially hidden sidebar retained; Opportunity adds depth, schedule and lineup cards. Existing private dashboard preserved. |

`npm run check` passed, including 144 UI tests and the complete data/API/market/waiver/build/production/sites chain. Local release verifier passed 499 assertions. Three fresh-context code reviews passed. Browser tests used real public data; private Yahoo behavior was tested with test-only fixtures, not represented as a live account test.

2026 nflverse now contains Weeks 1–3 (47 completed games at capture); 2025 remains byte-identical. The last verified DFS source remains 2026 Week 2, with 86 immutable historical captures; unavailable newer salaries or projections are explicitly labeled, never invented. Local screenshots and full logs are ignored artifacts. Public release evidence is in `shared/operations/contextual-research-20260928/`.

Capture synchronization follow-up: choosing an older salary capture in the Team Box sidebar also updates the matching-week table and export through the builder snapshot callback; a regression test asserts the exact older salary payload is reported.

Production verification: the permanent Bowser URL passed 499 data assertions and 9 exact-capture lineup assertions. The preview alias passed 499 data assertions. Production browser readback confirms the Player research totals and Market Pulse render. Yahoo is signed out in this browser; live private league data is not claimed as verified.

## Independent statistics / DFS windows — September 28, 2026

| Surface | Verified behavior |
| --- | --- |
| Header | Separate Base week / smaller Weeks back and DFS week / slate groups. Base 7 + 3 selects 5–7. Season and scoring remain shared. |
| Exact trends | All five metric menus retain independent metric selection; history count controls the common statistical window. Empty future slots stay anchored to Base week. |
| Monday Showdown | Real Week 2 Giants–Rams salary pool: 53 FLEX identities, only LA/NYG teams; matchup highlighted first, unrelated games disabled. Base 3 + 3 retains W1–3 totals and three bars. |
| Cumulative readback | Davante Adams W1–3: GP3, 144 snaps, 358 receiving yards, 2 receiving TD, 65.8 PPR, WR6. Opponent is Base-week DEN despite the independent NYG DFS matchup. |
| DFS off | DFS dropdowns, fields, source, lineup panel and matchup strip hidden; salary/game constraints removed. LA team filter returns 16 statistical players for W1–3. |
| Unavailable future source | Selecting DFS Week 4 preserves Base 3 / count3, shows Week 4 schedule and an unavailable slate notice; no stale Week 2 prices. No odds feed is manufactured; completed scores are explicitly Final, unavailable O/U is labeled. |
| Layout | Browser confirmed no document overflow at 1920px and 750px; table scrolling remains internal. Selected-game visibility is preserved by placing eligible slate games first. |

`npm run check` passed with 147 UI tests; exact-range API regression and three interaction tests cover coupled filters, role salaries, unmatched salary identities, DFS-off reset and unavailable future weeks. No warehouse, DFS archives, account credentials or private Yahoo data changed. Screenshots reside under ignored `artifacts/independent-weeks-20260928/`; public verifier evidence is stored in `shared/operations/independent-weeks-20260928/`.

## Player Database refinement — September 29, 2026

| Area | Verified behavior | Evidence |
| --- | --- | --- |
| Player Database game fields | No Kick column; Team/Opponent expose Base-week date and Eastern kickoff on hover/focus | Tooltip regression test; schedule-backed date readback |
| Player Database derived metrics | Avg Fpts appears only with count > 1; selected-slot denominator; incomplete imports unavailable. DFS Value follows actual selected capture, immediately after Proj | 151 UI tests; Davante Adams W1–3 total 65.8 / 3 = 21.9; Week 2 Classic 13.3 / 5.9 = 2.25 |
| Density and section controls | Team next to DST with matching 15px typography. 18px section restore rails, adjacent widths retained, subtle 1px group rules | Browser at measured CSS 1920×1080; collapse/restore regression |
| Depth research | Team first, search next, player selector last. Independent public roster, surname sorting, scoped search, source season labeled | Rams + puka returns only Puka Nacua; all-team roster endpoint tests |
| Shared grid / other routes | Section-boundary classes opt-in; existing week boundaries, pinning, sorting and resizing preserved | Full UI and production packaging suites |

The comparison uses the established LineupHQ implementation and Robert's September 29 changes. No warehouse, DFS archives, private Yahoo data, credentials or Player Card v2 changes.

### Positional Usage addition

The new sidebar panel provides team/position selectors, follows the selected player's sourced roster context, and has two dense views: By player (all relevant metrics under official depth labels) and Compare stat (one metric for all teammates). Values are printed above compact shared-scale bars; five common week headings avoid repeating dates in every row. Missing/bye slots remain dashes and actual zeroes remain zero. Selected players are highlighted; other player blocks can collapse. The independent five-week history includes Week 3 even while another game in that NFL week is unfinished, without changing the Opportunity Tracker's default anchor.

Full `npm run check` passed with 153 UI tests. Real-data browser readback verified both Positional Usage views, LA/WR selection, five aligned slots through Week 3, and 137 receiving yards for Davante Adams in the final slot. Independent local API verifiers passed 499 data and 12 window assertions.

Production release: permanent Bowser passed 499 data assertions, 12 independent-window assertions, and the four-position/937-roster readback. Preview alias passed the window verifier. The live browser confirmed both usage layouts and hidden sidebar on reload. Evidence: `shared/operations/player-columns-20260929/`.

## Positional Usage weekly sorting — September 29, 2026

Added compact Sort statistic / Week / direction controls plus clickable historical-week headers. Default is source depth order. A selected statistic defaults to the Base slot; every displayed week, including prior-season slots, is selectable. The active week is underlined and the exact metric/week/direction appears in a compact summary. Sorting moves complete player blocks in both views; selected players are highlighted without being pinned above higher-ranked teammates. Unknowns sort last in both directions, ties retain source order, and Depth order resets the ranking.

Regression tests cover Base-week targets descending, second-slot fantasy points ascending (including negative and zero values), missing values, ties, complete six-metric blocks, header toggle behavior, and comparison/player-view consistency.

Validation passed: full `npm run check` (155 UI tests), local/candidate/permanent 499 data assertions, candidate/permanent 12 window assertions, and live browser readback of both requested sorting examples. Evidence: `shared/operations/usage-sorting-20260929/`.


## Usage share + shared sidebar tabs — 2026-09-30

Scope: horizontal sidebar tabs on all seven routes; the new Player Database Usage share matrix; selected-league Yahoo transaction columns on Market Pulse and Waivers. Immutable source data, Player Card v2 and unrelated page contents remain unchanged.

### Reference and visual review

Read `handoff/usage-share/USAGE-SHARE-HANDOFF.md` in full and opened both supplied reference PNGs. The supplied Design System (8) ZIP contains the handoff, prompt and two PNGs only. `Bowser Sidebar Prototype.dc.html` and `proto/views.js` are absent; an in-chat request for their location remains unanswered. No claim is made to have inspected unavailable inline prototype styles.

Four pre-PR browser captures use the current production warehouse (2026 W3, PPR, last five aligned regular-season weeks), not fixtures:

| Group | Sidebar content width | Evidence | Result |
|---|---:|---|---|
| NYG RB | 400 CSS px | `shared/operations/usage-share-20260930/nyg-rb-400.png` | Six active players; exact gaps, negative Fpts and source totals |
| NYG RB | 240 CSS px | `shared/operations/usage-share-20260930/nyg-rb-240.png` | No horizontal overflow; narrow labels/numbers fit |
| LA WR | 400 CSS px | `shared/operations/usage-share-20260930/la-wr-400.png` | Six of seven active players, expandable; six correct stat hues |
| LA WR | 240 CSS px | `shared/operations/usage-share-20260930/la-wr-240.png` | No horizontal overflow; three-digit yards remain visible |

Capture environment: Codex in-app browser retained its existing 80% zoom. Raw browser surfaces are 1536×1200 pixels for a 1920×1500 CSS viewport; sidebar width assertions and contract measurements use CSS pixels. The existing shell retains its outside 20px right gutter. Measured body widths are exactly400/240, matrix widths372/212. Header25.996, block21.992, player21.992, chip18.008 CSS pixels (subpixel rounding within0.02px of26/22/22/18). Wide cells explicitly12px Helvetica Neue; fixed an inherited14px rule and duplicate body padding found during comparison. Header white800, totals bold, focused row#1c2b24, gaps#121212, one hue per stat and observed-value maxima match the contract.

### Deliberate differences and limits

- Route-specific tabs and width-driven More menu follow handoff§1 rather than the three demonstration tabs / Research label in the reference PNG. Existing Hide sidebar bar and outer shell are retained.
- Current source data has complete2026W3 values and six eligibleNYG backs, unlike the dated five-player PNG with unavailableW3. Historical receiving/rushing fields use actual available data, never copied prototype gaps.
- Prior explicit user rule excludes players without a positive recorded snap in all five displayed slots; one played week is sufficient. This is a display filter only.
- Below300px, week labels use8px, first header9px, and value chips10px (9px for four-character values,7.5px for longer values). The required70px identity+42px total leaves20px per week at240px; default12px numbers and10px week headers overlap. Row/chip geometry and full-value tooltips stay intact. Normal400px typography is unchanged.
- Following an explicitly selected player below the initial six automatically expands the group so focus stays visible; the user can collapse it again.
- Negative fantasy values remain negative. Heat-map alpha is clamped to valid CSS0–1 rather than generating invalid negative opacity.
- Yahoo counts are successful add/drop observations in the selected league's returned history (up to50 transactions), not fabricated Yahoo-wide totals. Captured time, returned coverage, and unknown values remain explicit. Live private account totals require an authorized session and were not claimed verified.

### Route comparison

| Route | Default tab / behavior | Verification |
|---|---|---|
| Player Database | Position Totals; Usage share follows selected player or stays pinned | Browser400/240, pin/tab/collapse persistence; component tests |
| Waivers | Favorites; Yahoo Adds/Drops/Total/Net | Sidebar/route tests; real-data public release smoke |
| Market Pulse | Most added; Yahoo Adds/Drops/Total/Net | Sidebar/route/coverage tests; real-data public release smoke |
| Team Box Scores | Latest game | Defaults, width-driven overflow, accessible tab selection tests |
| Opportunity Tracker | Biggest movers | Defaults and existing contents retained; route tests |
| League Hub | Information needed | More access to existing league research; no sample data added |
| Yahoo Connection | Status | Four existing panels; session privacy unchanged |

Keyboard tabs support arrows/Home/End; More supports selection/Escape/outside close. Active tabs restore per route in sessionStorage; sidebar still starts hidden. Browser pin survives tab changes/collapse. Local matrix no-horizontal-scroll assertion: body scrollWidth==clientWidth at240 and400.

Release gates: full `npm run check`, independent code/privacy review and candidate/public API regression verification. Detailed release evidence lives beside the four screenshots.

Final release verification: `npm run check` PASS (173 UI tests); GitHub verify PASS; candidate499/499 and permanent production499/499 read-only regression assertions PASS. Production browser rendered six NYG RB players in six metric blocks and restored Usage share after a collapsed reload. Public Yahoo sections explicitly show unavailable without a signed-in league session. Both permanent aliases promoted to `dpl_7DnfMtKpqHPTWAskamuvDgsuwyZU`. The last shell review fix keeps the More chevron outside the truncated label.

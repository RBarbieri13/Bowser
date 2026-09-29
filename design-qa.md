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

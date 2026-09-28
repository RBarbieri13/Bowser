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

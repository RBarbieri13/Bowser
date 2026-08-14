# Bowser design-system migration — design QA

final result: passed

## Source of truth and normalized captures

- Design handoff: `/tmp/bowser-design.PNRWp1/handoff/CODEX-HANDOFF.md`
- Pixel-accurate mocks: `/tmp/bowser-design.PNRWp1/Player Database.dc.html`, `Team Box Scores.dc.html`, `Game Box Score.dc.html`, and `Player Card.dc.html`
- The supplied 1440x900 browser captures under `artifacts/design-qa/source/` were reviewed for the original visual intent. Formal comparisons use fresh browser renders of the same inline mock HTML at the exact implementation viewport.
- Game Breakdown: source `artifacts/design-qa/source/game-breakdown-1512.png` versus implementation `artifacts/design-qa/implementation/game-breakdown-pass-3.png`, both 1512x940.
- Player Card: source `artifacts/design-qa/source/player-card-1180.png` versus the player-matched implementation `artifacts/design-qa/implementation/player-card-jameis.png`, plus `player-card-season.png` and `player-card-depth.png`, all 1180x820.
- Full-view comparisons: `artifacts/design-qa/comparisons/game-breakdown-side-by-side-pass-3.png` and `artifacts/design-qa/comparisons/player-card-jameis-side-by-side.png`.

## Shared shell and visual system

- PASS — The desktop shell matches the authoritative mock geometry: 16px outer padding, 216px sidebar, 16px inter-column gap, centered divider, and main canvas beginning at x=248.
- PASS — Only Player Database and Team Box Scores are live sidebar destinations, as required. Game Breakdown remains a routed detail view, and Player Card remains a modal instead of becoming navigation.
- PASS — Poppins is used for UI and display text; JetBrains Mono is used for ranks, times, scores, and statistical data with tabular numerals.
- PASS — The migration consistently uses the mock's near-black surfaces, flat neutral table headers, subtle borders, green accent, red negative state, 18px card radii, and restrained shadows. The supplied Bowser lockup and season tag are preserved.
- PASS — Existing copy, routes, API contracts, registries, sorting logic, localStorage keys, and accessibility semantics remain intact.

## Game Breakdown

- PASS — The hero, winner/loser emphasis, final status, clock/venue row, score-by-quarter table, team summary cards, combined-snaps card, game-flow card, and two fantasy box-score cards reproduce the mock's layout and hierarchy.
- PASS — The score-by-quarter card is 165px high and shows Team, Q1, Q2, Q3, Q4, and Final with no clipping. Winner classes are derived from returned scores rather than hard-coded mock data.
- PASS — Team summaries expose the same dense five-metric structure, green/red result emphasis, and combined total-snaps tile.
- PASS — The game-flow chart uses the source's thin axis, compact green score pills, and complete event list. The final chart displays five unobstructed labels: `0-7`, `3-7`, `3-14`, `6-14`, and `6-21`.
- PASS — The compact team cards intentionally display Pos, Player, and FPTS, matching the handoff. Player names are buttons and open the existing Player Card through the preserved profile handler.
- PASS — Responsive behavior and loading, error, `role=img`, dynamic-quarter, postseason/overtime, scoring, and back-navigation contracts remain preserved.

## Player Card modal

- PASS — The modal is 1060px wide at desktop, constrained to the viewport rather than assigned a fixed tall height, and uses the source's 18px frame, dark overlay, border, and shadow.
- PASS — A persistent 108x108 media tile holds the headshot or an icon fallback without shifting the identity layout. Metadata, league status, and close control match the handoff.
- PASS — Game Logs, Season Stats, and Depth Chart use the mock's green active-tab treatment while retaining the exact tablist, tab, tabpanel, `aria-selected`, `aria-controls`, and `aria-labelledby` relationships.
- PASS — Game Logs retain all existing registry groups in horizontally scrollable 72px tiles with green/red/neutral quantile tones. The source mock shows fewer QB-oriented groups; retaining the full application registry is the required behavior-preserving difference.
- PASS — Season Stats uses a single labeled tile row with green FPTS emphasis and retains all existing groups. Depth Chart uses four desktop columns, compact player rows, and a green selected-player treatment while preserving semantic player buttons and `aria-current`.
- PASS — The direct Game Logs comparison uses Jameis Winston on both sides. Production supplies the real headshot where the mock demonstrates a fallback tile, and the preserved full registry extends horizontally beyond the shorter mock subset; geometry, typography, spacing, and interaction styling match. Additional rows and groups scroll inside the modal rather than changing its outer frame.

## Interaction, accessibility, and runtime verification

- PASS — Direct browser inspection of `#/game/2025_01_NYG_WAS?scoring=ppr` confirmed two sidebar links, the full quarter header, dynamic winner styling, compact clickable player rows, five non-overlapping flow pills, and a 165px quarter card.
- PASS — Invoking the actual Russell Wilson player-row button through its DOM click path called the React handler and opened the labeled modal. The rendered dialog measured 1060px wide and its media tile measured 108x108.
- PASS — Browser inspection confirmed all three tab relationships and the active Game Logs tabpanel. Existing UI tests cover modal opening, tab switching, player data, league status, closing, focus restoration, game-route scoring, and back navigation.
- PASS — `npm run test:ui` completed 7/7 tests. `npm run build` completed successfully. No runtime errors appeared in the inspected Game Breakdown console.

## Comparison history

- Pass 2 exposed one P2 defect: PAT/score events occurring seconds apart produced overlapping chart pills.
- The repair collapses only chart labels when another scoring event follows within 90 seconds. It leaves every event in the semantic timeline list, preserving analysis detail and accessibility.
- Pass 3 resolved the collision and matched the five chart labels visible in the source. No P0, P1, P2, or actionable P3 visual defects remain.

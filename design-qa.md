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

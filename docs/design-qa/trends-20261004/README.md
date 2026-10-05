# Labeled trends acceptance — October 4, 2026

Source: `handoff/trend-column/BOWSER-TREND-COLUMN-HANDOFF.md`, its inline-styled prototype and four reference images. Browser inspection used real warehouse/API data at 1920×1080 CSS pixels. Prototype sample players never enter application data.

| Acceptance | Result | Evidence |
|---|---|---|
| One whole-number value per NFL week; latest white | PASS | Players 2–5 weeks, gap and decimal tests |
| One visible-column scale; maximum 12px | PASS | Browser measured maximum12px; filter/window tests |
| Five group palettes and matching trend headers | PASS | Player QB view; palette tests |
| Five graded arrows, flat-zero rule, normalized tooltip | PASS | Boundary tests; browser metric/sort interaction |
| Whole FPTS, exact values retained in tooltips | PASS | Player modal and negative/decimal tests |
| Existing rows preserved; N×28+24 widths | PASS with existing-row deviation | 2/3/4/5 columns measured80/108/136/164px; see below |
| 2–5 weeks without adjacent-cell overflow | PASS | 295 four-week and310 five-week cells, zero overflowing arrows |
| Source Code Pro values; Poppins trend chrome only | PASS | Browser computed600 12px /12px Source Code Pro; surrounding grid unchanged |
| Metric/history dropdown and independent sorting | PASS | Player, Waivers, Opportunity, Team Box; automated interaction tests |
| Missing, zero, negative, unsupported API window safety | PASS | Missing slots kept; ceil supported request window and exact display slice |

## Route comparison

| Area | Comparison / evidence |
|---|---|
| Player Database | `players-two-weeks.png`, `players-three-weeks.png`, `players-four-weeks.png`, `players-five-weeks.png`; all five category trends share each visible column's scale. Header metric menu and DESC-first sorting tested separately. |
| Waivers | `waivers-four-weeks.png`; Week4 waiver pool with actual Week3 statistics. Intermediate history counts request supported source windows then slice. No-history identities use metadata calendar slots with gaps. |
| Team Box Scores | `team-box-anchored.png`; NYG, Weeks1–3, trend inserted after Week1. Calendar anchor preserved; four-week option additionally checked. Group dragging and original filters retained. |
| Opportunity Tracker | `opportunity-five-weeks.png`; NYG RB, aligned2025W17–2026W3. Three independent metric menus, local trend sort, four/five-week display and existing value visibility option preserved. |
| Playing-time sidebar | `playing-time-sidebar.png`; common scales across teammates in each position group, sidebar table overflow remains scrollable. |
| Market Pulse | `market-history.png`; actual stored provider observation and capture clock, clearly distinguished from NFL weeks. Six-digit additions remain legible. |
| Player card trajectory | `player-card-four-weeks.png`; same cell anatomy, metric and history selectors retained. Modal sections and game logs untouched. |
| Usage Share / Fantasy News / League Hub / Yahoo / game clocks | No per-week bar trend to replace in these sections. Heat-map matrix, source clocks, schedules and reports remain unchanged. |

## Deliberate adaptations

- Preserve existing row heights (36px main grids,30px Team Box,72px Opportunity) instead of changing entire pages to the prototype's standalone28px rows. Trend plots remain26px. This follows the handoff's cell-only scope.
- The nonnegative prototype does not specify missing/negative data: missing stays `—`, sourced zero stays0, signed negatives keep their minus sign and a baseline stripe. Scale uses absolute magnitude so negatives fit12px. Missing endpoints produce an unavailable arrow, never a fabricated trend.
- Market activity is not an NFL-stat column: provider counts can have six or more digits. Its standalone history view widens slots as needed and remains horizontally scrollable. NFL trend columns retain24px bars and the exact width formula.
- Existing optional calendar labels and Opportunity value-visibility toggle are preserved. New labels are shown by default.
- Legacy unmounted table implementations retain their existing renderer; every trend surface reachable through the current LineupHQ routes uses the new shared renderer. Backend, source snapshots, Yahoo state, polling and immutable warehouse are untouched.

## Verification

`npm run check`, `npm run lint`, 23 focused trend-contract tests and independent read-only review PASS. Full check includes239 UI cases, warehouse/source checks, backend/private-boundary tests, production server and Sites build tests. Tests replacing the old linear-height ratio assert the new prototype's exact2px floor/12px maximum and a common source maximum; calendar and missing-value assertions are retained.

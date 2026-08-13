# Design QA

Date: 2026-08-11

## Source truth and comparison evidence

| Surface | Reference | Final implementation | Same-input comparison |
| --- | --- | --- | --- |
| Game Logs | `/var/folders/mk/4zpvpljs7757dgf6h9qswksh0000gn/T/codex-clipboard-21750ad8-514c-4ba2-8e38-7b04db6c42ca.png` | [`artifacts/design-qa/player-profile-game-logs-final.png`](artifacts/design-qa/player-profile-game-logs-final.png) | [`artifacts/design-qa/comparison-game-logs.png`](artifacts/design-qa/comparison-game-logs.png) |
| Season Stats | `/var/folders/mk/4zpvpljs7757dgf6h9qswksh0000gn/T/codex-clipboard-c20e9a40-4911-4522-a718-f71a413bdedc.png` | [`artifacts/design-qa/player-profile-season-stats-desktop.png`](artifacts/design-qa/player-profile-season-stats-desktop.png) | [`artifacts/design-qa/comparison-season-stats.png`](artifacts/design-qa/comparison-season-stats.png) |
| Depth Chart | `/var/folders/mk/4zpvpljs7757dgf6h9qswksh0000gn/T/codex-clipboard-828aa634-e965-458f-af67-58576fa1a9b7.png` | [`artifacts/design-qa/player-profile-depth-chart-desktop.png`](artifacts/design-qa/player-profile-depth-chart-desktop.png) | [`artifacts/design-qa/comparison-depth-chart.png`](artifacts/design-qa/comparison-depth-chart.png) |
| Week picker | User requirement plus existing Bowser visual language | [`artifacts/design-qa/week-picker-final.png`](artifacts/design-qa/week-picker-final.png) | Direct browser inspection |

The references and implementation were placed together in the linked comparison images and judged as one visual input. The implementation deliberately translates the supplied light examples into Bowser's established dark analytics language while retaining their defining anatomy: compact grouped stat tables, rounded metric cells, relative green/red performance coloring, prominent section tabs, and positional depth cards.

The final desktop state was inspected at a 1,600 × 900 CSS viewport. Browser screenshot output was normalized to the first 1,280 × 720 render tile because the in-app browser backend duplicated tiles at its current device scale. Mobile layout measurements were read directly from the page at 390 × 843 CSS pixels; its document and tabs both measured exactly 390 px wide.

## Visual and interaction review

- Typography follows the existing Bowser display/body system and maintains the references' strong player identity, section headings and compact numeric hierarchy.
- Game Logs preserves grouped Fantasy, Passing, Rushing and Receiving headers. Quantile-based green/red fills identify relative strengths and weaknesses; non-applicable all-zero metrics remain neutral.
- Season Stats uses the same grouped-cell grammar and shows a truthful, complete 2025 regular-plus-postseason aggregate.
- Depth Chart uses the reference's positional card layout, but is explicitly labeled `2025 team production order` because no authoritative live depth-chart feed is connected.
- Player headshots are real nflverse assets. League membership reads `Roster data not connected` instead of inventing roster state.
- The week picker supports direct Week 1–22 selection, inclusive From/To controls, a dual range selector, and Regular/Postseason/Full presets. Totals update automatically.
- Christian McCaffrey verified at 416.6 PPR points for Weeks 1–18, 39.1 for Week 7, and 458.4 for Weeks 1–22.
- Player names, teammate links, all three tabs, close/Escape behavior, focus restoration, table sorting and week presets were exercised in the browser.
- At mobile width, the profile fills the viewport, tabs fit without horizontal overflow, the week picker remains contained, and new primary touch targets are at least 44 px.
- Final browser console: zero warnings and zero errors.

## Iteration history

| Pass | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | P1 | The opened week picker could sit below the sticky table header. | Raised the filter-band stacking context and visually rechecked the opened picker. |
| 1 | P2 | Mobile player tabs overflowed the viewport by 34 px. | Changed the tab strip to an equal three-column grid; final client and scroll widths are both 390 px. |
| 1 | P2 | All-zero non-applicable stat groups could receive a positive color. | Added an all-zero guard so only meaningful relative values are colored. |
| 2 | — | Full and focused recheck. | No P0, P1 or P2 findings remain. |

## Severity review

- P0 blockers: none.
- P1 blockers: none.
- P2 blockers: none.

## 2026-08-12 brand lockup and team box-score page

### Source truth and comparison evidence

| Surface | Reference | Final implementation | Same-input comparison |
| --- | --- | --- | --- |
| Bowser header lockup | `/Users/robert.barbieri/Downloads/Bowser _ Peeking Mascot Lockup 2.png` | [`src/assets/bowser-mascot-lockup.png`](src/assets/bowser-mascot-lockup.png) | Transparent asset checked on both white and Bowser dark surfaces in `artifacts/logo-qa/` |
| Team box scores | `/var/folders/mk/4zpvpljs7757dgf6h9qswksh0000gn/T/codex-clipboard-2b4b3659-a249-4e10-ae88-b0beacabc003.png` and the linked Google Sheet `Dashboard!A1:AW35` | [`artifacts/logo-qa/team-boxscores-desktop-clean.png`](artifacts/logo-qa/team-boxscores-desktop-clean.png) | [`artifacts/logo-qa/reference-vs-implementation.png`](artifacts/logo-qa/reference-vs-implementation.png) |

The final comparison preserves the reference's defining information architecture: frozen position/player identity, forward-looking DraftKings Salary and DraftKings Projection slots, repeated historical week headers, matchup context, position-specific passing or receiving groups, rushing groups, fantasy points, and vertical position sections. It translates the spreadsheet's white canvas into Bowser's existing dark analytics system without altering the data hierarchy.

### Visual and interaction review

- The supplied mascot lockup is the only visible brand asset in the shared header; the prior text/initial treatment is absent. The processed 1200 × 591 PNG has a transparent canvas and retains the internal black artwork.
- The team selector, scoring selector, Week 1–22 range picker, player profile links, and one-week horizontal scroll controls were exercised in the in-app browser.
- NYG Weeks 4–7 matched the reference state with real 2025 opponents and nflverse player lines. The local team query returned 37 player-week rows across 13 players in under 1 ms.
- DraftKings Salary and DraftKings Projection are deliberately rendered as unavailable slots because no DraftKings source is connected; no values are inferred.
- Desktop and narrow-screen states keep horizontal overflow inside the box-score scroller. At the narrow check, document width equaled viewport width while the table retained a separately scrollable 2,624 px analysis surface.
- The Next Weeks control moved the weekly analysis surface by one week block (553.75 px measured).
- Player Database remained reachable through the shared navigation and retained the same responsive header/logo.
- Final browser console: zero warnings and zero errors.

### Severity review

- P0 blockers: none.
- P1 blockers: none.
- P2 blockers: none.

final result: passed

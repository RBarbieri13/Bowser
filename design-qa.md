# Design QA

Date: 2026-08-10

## Comparison evidence

- Reference: `/var/folders/mk/4zpvpljs7757dgf6h9qswksh0000gn/T/codex-clipboard-ff8aef76-022d-40f0-a235-9d12d9f22df0.png`
- Final desktop render: [`artifacts/design-qa/desktop-final.png`](artifacts/design-qa/desktop-final.png)
- Side-by-side reference and render: [`artifacts/design-qa/desktop-final-comparison.png`](artifacts/design-qa/desktop-final-comparison.png)
- Responsive render: [`artifacts/design-qa/mobile-final.png`](artifacts/design-qa/mobile-final.png)

The reference and final desktop render were compared side by side at 1823 × 863 in the same default table state. The deliberate content differences are the requested 2025 season, live nflverse rankings, and em dashes for unavailable DraftKings prices.

## Measured desktop anatomy

| Element | Reference target | Rendered measurement | Result |
| --- | ---: | ---: | --- |
| Filter band | 157 px | 156.99 px | Pass |
| Query band | 89 px | 88.98 px | Pass |
| Player group | 598 px | 598.03 px | Pass |
| Passing group | 436 px | 435.96 px | Pass |
| Rushing group | 248 px | 248.01 px | Pass |
| Receiving group | 360 px | 360.06 px | Pass |
| DFS group | 180 px | 180 px | Pass |
| Table | 1822 px | 1822.05 px | Pass |
| Data row | 52 px | 51.99 px | Pass |

## Interaction and responsive QA

- Player/team search, position filtering, specific NFL week filtering, server-side sorting, top-N limits, full-list access, custom rank ranges, scoring changes, season-type changes, and the More Filters panel were exercised in the browser.
- Disabling Top-N rendered all 608 regular-season players; selecting full season returns all 609 warehouse players. A specific-week query for weeks 1, 3, and 7 returned 510 players.
- Custom ranks `1-3, 8` returned ranks `1, 2, 3, 8`.
- A QB filter returned only QB rows; an `Allen` search returned the matching player set.
- Column sorting cycles ascending, descending, and unsorted; Shift-click adds up to two secondary sort fields.
- No browser console errors were present in the final clean session.
- At a 390 × 844 mobile viewport, the query controls stack full-width, three data rows remain visible above the fold, the table has a 1,787 px horizontal scroll surface, and the Select/Rank/Name identity columns remain sticky.
- `npm run test:ui` runs automated jsdom interaction coverage for all-player access, position and week filters, tri-state sorting, and Shift-click secondary sorting.
- Keyboard focus rings, native labels, table semantics, loading/error/empty states, reduced-motion behavior, and 44 px-or-larger core touch targets are present.

## Severity review

- P0 blockers: none.
- P1 blockers: none.
- P2 blockers: none.

final result: passed

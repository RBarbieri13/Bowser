# Team Box Score table controls — design QA

Reference: `codex-clipboard-c7370392-3ee9-4f84-b9fa-3f88749797e6.png`

Prototype capture: `output/playwright/team-box-controls-local-fixed.png`

Viewport compared: 1200 × 1644 desktop, Team Box Scores, NYG, Weeks 1–18, 100% week width, schedule collapsed.

## Comparison

- PASS — The dense dark database treatment, sticky identity block, repeated weekly groups, matchup headers, stat heatmaps, and red FPTS column preserve the supplied visual system.
- PASS — Numeric body type is larger while horizontal cell padding is reduced to 2px and row height remains 46px.
- PASS — The former pale DK Projection header is now an explicit dark surface matching DK Salary; browser-computed background is `rgb(32, 36, 37)`.
- PASS — The new marker column is intentionally narrow and sits between position and player without disrupting sticky offsets.
- PASS — Statistics and My Leagues controls integrate into the existing filter language; the week-width slider is a fixed 280px control.
- PASS — Navigation labels are larger and the active tab uses restrained tonal separation plus the existing red underline.
- PASS — Semantic resizer handles are unobtrusive until hover/focus, and widths propagate to every repeated week and relevant position table.

## Remaining polish

- P3 — At minimum week width, low-priority headers necessarily abbreviate; the current labels and ellipsis preserve legibility without overflow.

Final result: passed

# Bowser design QA

## Scoreboard-Rail Drive Waterfall

### Evidence

- Source visual truth: `/tmp/bowser-waterfall.bVLbGW/handoff/drive-waterfall-reference.png`
- Browser-rendered implementation: `/tmp/bowser-waterfall-component-1500.png`
- Full-view normalized comparison: `/tmp/waterfall-comparison-pass1.png`
- Focused summary implementation: `/tmp/bowser-waterfall-summary.png`
- Focused lower-drive implementation: `/tmp/bowser-waterfall-lower.png`
- Responsive implementation: `/tmp/bowser-waterfall-mobile-760.png`
- Source pixels: 1557 x 2092. The source was normalized to 750 px wide for the side-by-side comparison.
- Implementation pixels: 1500 x 1898. Browser CSS artboard: 1500 px wide at scale 1 inside an 1800 x 1200 viewport. The component contains 19 real drives rather than the reference's 21-drive demo, so its content height is correctly shorter.
- State: 2025 Week 1 NYG at WAS, PPR, final score NYG 6-21 WAS, all 19 nflverse drives, away red/home green.

### Findings

- No actionable P0, P1, or P2 findings remain.
- The reference and implementation use different games by design. The source depicts the handoff's NYG 37-40 DAL overtime demo; the implementation is verified against real NYG 6-21 WAS data. Score, drive count, drive geometry, period count, and totals therefore differ while the visual grammar remains faithful.
- P3: the source screenshot is 1557 px wide even though the handoff specifies a 1500 px artboard. The implementation follows the written 1500 px contract and scales that exact artboard to its container.

### Required fidelity surfaces

- Fonts and typography: Poppins is used for titles and team chips; JetBrains Mono is used for every number and data label. Weight, hierarchy, uppercase treatment, and tabular-number alignment match the handoff.
- Spacing and layout rhythm: the component uses the specified 24 x 28 px card padding, 18 px card radius, 14 px inset radius, 136 px scoreboard rail, 16 px lane gap, 74 px field lanes, 30 px bars, and major/minor period separators. The artboard scales as one unit without page overflow.
- Colors and visual tokens: computed browser values confirm card `#181818` and border `#2E2E2E`; the full component uses the prescribed away red, home green, pass blue, run gold, turnover red, and neutral greys.
- Image quality and assets: this component intentionally contains no image assets, player imagery, decorative graphics, or fantasy content. Phosphor icons provide the result and direction symbols specified in the handoff.
- Copy and content: the title, explanatory sentence, scoreboard/goal labels, period banners, bar legend, result chips, score rail, and P/R count notation reproduce the reference vocabulary. Every value is populated from the nflverse drive warehouse rather than demo text.
- Accessibility and behavior: all drive bars are keyboard-focusable and expose complete aria labels and native title tooltips. Pass and run segments expose independent yardage tooltips. Period breaks and the visualization region have semantic labels.
- Responsive behavior: at 760 x 900, body scroll width equals client width (760 px), page content is 665 px wide, and the 1500 px artboard scales to 665 px without horizontal overflow. All 19 drives and the participation section remain present.

### Comparison history

1. The first browser render passed the component geometry and design-token checks at the 1500 px source artboard. No P0/P1/P2 visual repair was required.
2. A lower-page focused capture verified that the halftime and fourth-quarter banners, late-game score rails, touchdown glow, turnover chip, kneel chip, legend, and transition into Key player participation remain visible and aligned.
3. A 760 px responsive capture verified the scaling wrapper and no-overflow contract. Keyboard focus verified the exact drive tooltip and visible focus outline.

### Primary interactions and data checks

- 19 of 19 real drives rendered for `2025_01_NYG_WAS`
- Full bar tooltip and accessible label verified on the opening WAS drive
- Pass/run segment title tooltips present
- Keyboard focus outline present on drive bars
- Key player participation preserved immediately below the waterfall
- 1500 px scale-1 desktop artboard and 665 px scaled artboard both verified
- No body or page-level horizontal overflow at 1512 px or 760 px
- `npm run check` passed: warehouse integrity, 11 API/data tests, 16 UI tests across the active test roots, build, production-server tests, and Sites packaging tests

## Player Trends

### Target and evidence

- Source reference: `/var/folders/mk/4zpvpljs7757dgf6h9qswksh0000gn/T/codex-clipboard-c4a9c898-240c-4703-aca2-19f2bb5b9f17.png` (625 x 153)
- Normalized source: `docs/design-qa/player-trends-source-normalized.png`
- Focused implementation: `docs/design-qa/player-trends-implementation-normalized.png` (625 x 153)
- Side-by-side comparison: `docs/design-qa/player-trends-comparison.png`
- Full implementation: `docs/design-qa/player-trends-implementation-full.jpg`
- Responsive implementation was verified interactively at 1024 x 768 and 768 x 900; the persistent desktop comparison artifacts are listed above.

### Visual contract

- The compact dark bar-chart treatment, metric labels, numeric data labels, restrained grid lines, Poppins UI typography, and JetBrains Mono data typography match the supplied reference and the existing Bowser design system.
- The reference's grouped chart is intentionally distributed into four table-adjacent chart columns because the requested information architecture requires Snaps, Touches, Targets, and Fantasy Points to sit beside their corresponding statistics.
- Each chart uses ten fixed game slots, a metric-specific color, a shared same-metric scale, and robust p90 normalization so outliers do not flatten the remaining games.
- The Depth section is placed between Upcoming and Season Usage, and its popover uses a fixed portal so it is not clipped by the horizontally scrolling table.

### States checked

- Default Player Trends shown state
- Player Trends hidden and restored through the toolbar toggle
- Depth chart opened by the rank trigger and closed with Escape
- 1600 x 900 default desktop layout
- 1024 x 768 responsive filter layout
- 768 x 900 compact responsive layout
- Empty/missing game slots and explicit zero-value bars
- Browser console warnings and errors: none

### Iterations

1. The first rendered depth chart was mounted but hidden by a stale `display: none` declaration. The rule was corrected to `display: block`, and the UI test now asserts that the popover is visible.
2. The first 1024px pass allowed the growing filter row to crowd the rightmost toggles. The filters now switch to a four-column responsive grid at 1120px and a two-column grid at 767px; Draft Rankings, Yahoo Stats, and Player Trends remain visible in both checked viewports.

### Final assessment

- P0 issues: none
- P1 issues: none
- P2 issues: none
- Remaining differences: intentional table integration described above

final result: passed

## Player Database View Settings and Collapsed-State Cleanup

### Target and evidence

- Supplied problem state: `/var/folders/mk/4zpvpljs7757dgf6h9qswksh0000gn/T/codex-clipboard-9c78892a-a619-4914-b288-c851a48d7681.png`
- Normalized source: `artifacts/design-qa/player-view-settings/source-normalized.png`
- Verified default: `artifacts/design-qa/player-view-settings/default-clean.png`
- Verified collapsed state: `artifacts/design-qa/player-view-settings/collapsed-clean.png`
- Verified settings drawer: `artifacts/design-qa/player-view-settings/custom-columns-drawer.png`
- Side-by-side comparison: `artifacts/design-qa/player-view-settings/before-after-comparison.png`
- Browser viewport: 1600 x 900.

### Visual contract

- Collapsed sections occupy zero table width. No synthetic columns, plus-button rails, blank gutters, or full-height spacer bands remain.
- One-pixel section borders carry normal hierarchy; only true segment endings use the restrained two-pixel divider.
- One collapsed section produces a single restore chip in the panel title bar. Multiple collapsed sections consolidate into one count-based menu with individual and restore-all actions.
- Smart Compact uses content-fit widths and shorter group labels only when at least two sections are hidden or collapsed; stored manual widths are preserved for the restored layout.
- Custom Columns is a right-side settings drawer with quick views, individual and group visibility, group collapse/restore, Auto Fit, Smart Compact, and 3/5/6/8/10-game trend controls.
- The standalone Depth column is removed. A blue `D` rank badge sits inside the player-name cell and retains the complete hover, focus, click, Escape, and focus-return tooltip behavior.
- Player Trend group headers now use the same 13 px type scale and tracking as other section headers. Bar gaps are one pixel, chart widths are reduced, and the numeric labels use a larger 8 px bold data style.
- Snap percentage is hidden in the migrated/default view but remains available through Custom Columns.

### States checked

- Default view after preference migration/reset
- Passing and Receiving collapsed together with Smart Compact active
- No `[data-column^="collapsed-"]` elements in the rendered table
- One and multiple collapsed-section restoration controls
- Individual source-column hiding automatically hides its linked trend chart
- Trend range changed from 10 games to 5 games
- Depth badge popover opened and dismissed
- Custom Columns opened, reset, closed, and returned focus to its trigger
- Persisted version-2 preferences retained across remounts in UI tests
- Browser console warnings and errors: none observed during the interactive pass

### Iterations

1. Replaced the original 46 px synthetic collapsed columns with true zero-width section removal and moved collapse controls into the settings drawer.
2. Reduced the original three-pixel divider treatment after the combined comparison showed that it still dominated the dense table hierarchy.
3. Changed Smart Compact from a destructive width rewrite to a derived presentation state so manually chosen widths return when sections are restored.
4. Removed nested labels from the settings column list and added trigger focus restoration for valid, predictable keyboard behavior.
5. Added preference migration so existing users receive the new compact chart widths and default-hidden Snap % without changing the established localStorage key.
6. Fixed the independent verifier's cross-control findings so toolbar toggles restore groups hidden through Custom Columns, mixed group checkboxes perform the advertised show-all action, and the embedded depth badge is explicitly associated with its open tooltip for assistive technology.

### Final assessment

- P0 issues: none
- P1 issues: none
- P2 issues: none
- Remaining differences from the supplied screenshot: intentional removal of collapsed spacer rails, consolidated restoration, embedded depth badge, and calmer divider hierarchy

final result: passed

# Player Database Column Studio Design QA

- Reference: `/var/folders/mk/4zpvpljs7757dgf6h9qswksh0000gn/T/codex-clipboard-b8cce57e-3edd-431b-9868-d66b5d60be8b.png`
- Implementation screenshot: `artifacts/player-database-redesign/column-studio-1440x1024.png`
- Focused implementation region: `artifacts/player-database-redesign/column-studio-focused.png`
- Combined comparison input: `artifacts/player-database-redesign/column-studio-comparison.png`
- Browser viewport: 1440 x 1024 CSS pixels
- Reference pixels: 1360 x 1124
- Implementation pixels: 1800 x 1279 (browser capture scale); focused region: 650 x 512
- Verified state: Player Database loaded with nflverse rows; Column Studio open; Balanced preset active; primary sections visible; optional sections available; settings footer visible.

## Visual comparison

The implementation preserves the selected middle concept's hierarchy and interaction model: centered dark modal, mint eyebrow and actions, saved-view toolbar, vertical quick-presets rail, two-column section controls with centered checkboxes, selected and visible status, per-section expansion, segmented trend window, ordered section chips, and paired cancel/apply actions.

The implementation intentionally adds Draft Metrics, Yahoo Fantasy, DFS, and Advanced Stats to the section list because those existing data contracts must remain configurable. They use the same row treatment and do not change the selected concept's visual language.

## Interaction evidence

- Quick preset selection changes the active highlighted row and `aria-pressed` state.
- Trend window switches between 5, 8, and 10 games.
- Section rows expand to reveal named metrics such as Snap trend rather than ambiguous repeated labels.
- Section visibility switches and individual metric checkboxes update the staged view.
- Table-order controls support drag-and-drop plus explicit left and right moves.
- Applying the Opportunity preset with a 5-game window closed the modal and rendered five bars in each visible trend chart.
- Browser console contained no errors.

## Findings and iteration history

1. Initial browser pass exposed a warehouse query regression (`stats.passing_attempts`); corrected it to the real `player_week_stats.attempts` column and reloaded with live player rows.
2. Directional table-order controls initially used insertion semantics; changed them to adjacent swaps so both left and right actions are deterministic.
3. Added a single-column mobile expansion layout below 680 px to prevent checkbox and label misalignment.
4. Directly rendered trend bars so changing the trend window cannot leave lazy placeholders blank.
5. The independent verifier found that hidden optional sections could make adjacent order controls appear inert and that saved-view selection was committing before Apply. Visible-order movement now swaps the nearest visible sections, drag/drop inserts on the correct side of its target, and saved-view selection is fully staged until Apply. Dedicated UI coverage now exercises both paths.

No remaining P0, P1, or P2 visual defects were found in the combined comparison.

final result: passed

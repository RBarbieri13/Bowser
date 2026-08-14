# Bowser game-script console design QA

## Evidence

- Source visual truth: `/Users/robert.barbieri/.codex/generated_images/01a001a4-0b4b-7ec2-8081-2bf6575cb27f/exec-64a588d4-e354-45e5-9b65-c03685b98ce5.png`
- Browser-rendered implementation: `/Users/robert.barbieri/.claude/projects-workspace/Fantasy Football/Bowser/artifacts/game-console-implementation-pass-3.png`
- Focused Opportunity console: `/Users/robert.barbieri/.claude/projects-workspace/Fantasy Football/Bowser/artifacts/game-console-focused-final.png`
- Focused Production console: `/Users/robert.barbieri/.claude/projects-workspace/Fantasy Football/Bowser/artifacts/game-console-production-final.png`
- Side-by-side full-view comparison: `/Users/robert.barbieri/.claude/projects-workspace/Fantasy Football/Bowser/artifacts/game-console-comparison-final.png`
- Source pixels: 1672 x 941. Implementation capture: 1365 x 768. Source normalized to 1365 x 768 for the side-by-side comparison. Browser CSS viewport: 1365 x 768; reported device pixel ratio: 3. The browser screenshot surface returned one CSS pixel per output pixel.
- State: 2025 Week 1 NYG at WAS, PPR, WAS selected, Opportunity mode, Game segments scale, Compact density, console height 470 px.

## Findings

- No actionable P0, P1, or P2 findings remain.
- The implementation intentionally retains Bowser's existing 216 px application sidebar, while the generated source is a full-width isolated game-analysis concept. The remaining composition difference is an expected product-shell constraint, not an implementation defect. At the captured 1365 px width, the insight rail moves beneath the analysis so all six game segments remain usable.
- P3: The source concept contains decorative team lockups and a persistent crosshair tooltip. The implementation uses the existing product logo, text team abbreviations, focusable scoring points, and native exact-value tooltips so visible content remains warehouse-backed rather than fabricated.

## Required fidelity surfaces

- Fonts and typography: Poppins and JetBrains Mono preserve the existing Bowser design system. Display, label, and tab weights follow the source hierarchy; dense KPI values remain legible without wrapping.
- Spacing and layout rhythm: the score/play-selection card, resize rail, console toolbar, table header, four-lane cells, sticky footer, and insight cards preserve the source's stacked broadcast-analysis rhythm. Six equal segment columns now measure 127 px each at the tested viewport.
- Colors and visual tokens: near-black surfaces, muted borders, green active states, red rushing, blue pass-attempt, and gold target lanes match the chosen direction. Production uses gold, red, purple, and green without sharing scales.
- Image quality and assets: the existing transparent Bowser lockup and nflverse headshots remain sharp and correctly cropped. No placeholder product imagery or custom SVG artwork was introduced; interface icons use Phosphor.
- Copy and content: Opportunity is the fixed mode name. It contains Snaps, Rush attempts, Pass attempts, and Targets in every player/segment cell. Production contains Yards, Touchdowns, Receptions, and Fantasy points. The scaling explanation explicitly says metrics never share a scale.
- Accessibility and behavior: the team selector, mode selector, sorting, density, scale, player links, and reset are semantic controls. The height handle is a keyboard-operable separator with min/max/current values. Both team states and both metric modes were exercised.
- Responsive behavior: at 1365 x 768 the insight rail stacks below the core analysis, the toolbar remains fully visible, and the six segment columns fit with only a narrow internal horizontal reserve. Dense content stays inside the console's own scroll area.

## Comparison history

1. Pass 1 found a P1 data-grid density defect: the global 1822 px player-table width rule leaked into the participation console, expanding every segment to roughly 244 px and hiding two segments at the tested viewport.
2. The console received a page-specific table-width contract: 1120 px total, 205 px player identity, six synchronized 127 px segment columns, and a 155 px total column.
3. Pass 3 verified nine WAS players, six visible segment headers, four Opportunity lanes per cell, four Production lanes per cell, functional team/mode switching, a persisted resizer value, and zero browser warnings or errors.

Focused comparison was required because the source's four-lane KPI cells are too small to judge reliably in a full-frame pair. The dedicated Opportunity and Production captures confirm the lane count, color order, value alignment, internal scrollbar, and table footer.

## Primary interactions tested

- WAS and NYG team switching
- Opportunity and Production switching
- Four same-metric lanes in both modes
- Sort and comparison-scale controls
- Compact density
- Keyboard height resizing from 470 to 494 px
- Nine-player roster with internal vertical scrolling
- Player-button semantics
- Browser console: zero errors and zero warnings

final result: passed

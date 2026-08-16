# Scoreboard–Rail Drive Waterfall design QA

## Evidence

- Source visual truth: `/tmp/bowser-waterfall.bVLbGW/handoff/drive-waterfall-reference.png`
- Browser-rendered implementation: `/tmp/bowser-waterfall-component-1500.png`
- Full-view normalized comparison: `/tmp/waterfall-comparison-pass1.png`
- Focused summary implementation: `/tmp/bowser-waterfall-summary.png`
- Focused lower-drive implementation: `/tmp/bowser-waterfall-lower.png`
- Responsive implementation: `/tmp/bowser-waterfall-mobile-760.png`
- Source pixels: 1557 × 2092. The source was normalized to 750 px wide for the side-by-side comparison.
- Implementation pixels: 1500 × 1898. Browser CSS artboard: 1500 px wide at scale 1 inside an 1800 × 1200 viewport. The component contains 19 real drives rather than the reference's 21-drive demo, so its content height is correctly shorter.
- State: 2025 Week 1 NYG at WAS, PPR, final score NYG 6–21 WAS, all 19 nflverse drives, away red/home green.

## Findings

- No actionable P0, P1, or P2 findings remain.
- The reference and implementation use different games by design. The source depicts the handoff's NYG 37–40 DAL overtime demo; the implementation is verified against real NYG 6–21 WAS data. Score, drive count, drive geometry, period count, and totals therefore differ while the visual grammar remains faithful.
- P3: the source screenshot is 1557 px wide even though the handoff specifies a 1500 px artboard. The implementation follows the written 1500 px contract and scales that exact artboard to its container.

## Required fidelity surfaces

- Fonts and typography: Poppins is used for titles and team chips; JetBrains Mono is used for every number and data label. Weight, hierarchy, uppercase treatment, and tabular-number alignment match the handoff.
- Spacing and layout rhythm: the component uses the specified 24 × 28 px card padding, 18 px card radius, 14 px inset radius, 136 px scoreboard rail, 16 px lane gap, 74 px field lanes, 30 px bars, and major/minor period separators. The artboard scales as one unit without page overflow.
- Colors and visual tokens: computed browser values confirm card `#181818` and border `#2E2E2E`; the full component uses the prescribed away red, home green, pass blue, run gold, turnover red, and neutral greys.
- Image quality and assets: this component intentionally contains no image assets, player imagery, decorative graphics, or fantasy content. Phosphor icons provide the result and direction symbols specified in the handoff.
- Copy and content: the title, explanatory sentence, scoreboard/goal labels, period banners, bar legend, result chips, score rail, and P/R count notation reproduce the reference vocabulary. Every value is populated from the nflverse drive warehouse rather than demo text.
- Accessibility and behavior: all drive bars are keyboard-focusable and expose complete aria labels and native title tooltips. Pass and run segments expose independent yardage tooltips. Period breaks and the visualization region have semantic labels.
- Responsive behavior: at 760 × 900, body scroll width equals client width (760 px), page content is 665 px wide, and the 1500 px artboard scales to 665 px without horizontal overflow. All 19 drives and the participation section remain present.

## Comparison history

1. The first browser render passed the component geometry and design-token checks at the 1500 px source artboard. No P0/P1/P2 visual repair was required.
2. A lower-page focused capture verified that the halftime and fourth-quarter banners, late-game score rails, touchdown glow, turnover chip, kneel chip, legend, and transition into Key player participation remain visible and aligned.
3. A 760 px responsive capture verified the scaling wrapper and no-overflow contract. Keyboard focus verified the exact drive tooltip and visible focus outline.

## Primary interactions and data checks

- 19 of 19 real drives rendered for `2025_01_NYG_WAS`
- Full bar tooltip and accessible label verified on the opening WAS drive
- Pass/run segment title tooltips present
- Keyboard focus outline present on drive bars
- Key player participation preserved immediately below the waterfall
- 1500 px scale-1 desktop artboard and 665 px scaled artboard both verified
- No body or page-level horizontal overflow at 1512 px or 760 px
- `npm run check` passed: warehouse integrity, 11 API/data tests, 16 UI tests across the active test roots, build, production-server tests, and Sites packaging tests

final result: passed

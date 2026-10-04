# Shared selectors acceptance — October 4, 2026

Implementation uses the two supplied inline prototypes. Screenshots are 1920×1080 with real repository-backed public data, not prototype fixtures. Yahoo account content was not captured.

## Route comparison

| Route | Result | Evidence |
|---|---|---|
| Player Database | PASS: multi-position and multi-team union filters compose; slate eligibility stays separate from explicit matchup selection; Shift adds a game | [Screenshot](players.png) |
| Waivers | PASS: team checkbox dropdown and multi-position pills; two selected matchups yield four teams; LA/LAR aliases match | [Screenshot](waivers.png) |
| Team Box Scores | PASS: independent single matchup retains main range; Games shown exposes 1–22 slots; 6-week window tested across seasons; DK$ immediately before FPTS; Fantasy heading readable | [Screenshot](team-box-scores.png) |
| Fantasy News | PASS: all global pills fit the 48px bar; Teams/Pos/Status multi-select; selector uses existing schedule and inMatchups; compact 220px/22px and regular 248px/26px | [Screenshot](fantasy-news.png) |
| Market Pulse | PASS: team/position/provider/topic/tone multiple OR values; ownership display allows up to three leagues | UI regression suite + source review |
| Opportunity Tracker | PASS: position filters compose; research team remains one context | UI regression suite + source review |
| League Hub / Yahoo | PASS: multiple league scopes filter consistently; private values stay memory-only | UI regression suite + source review |

## Game selector checklist

| Requirement | Result / evidence |
|---|---|
| All first, every game, horizontal overflow | PASS, four real-data routes |
| 32 local 28×28 logos, crisp at 2× | PASS, original transparent 515×515 official Riddell primary helmet PNGs; offline hashes/dimensions verified |
| Pre-kick favorite spread / total | PASS renderer tests; current schedule does not supply odds, so public boxes honestly display — |
| Live green dot, clock, leader, possession | PASS sourced renderer tests; live fields absent from current public schedule remain unavailable |
| Final label and winner/loser colors | PASS tests and Team Box actual completed games |
| Selected green ring/fill and .45 fade | PASS browser multi-game interaction and CSS inspection |
| Selected/All clears, Shift adds except Team Box | PASS component tests and browser |
| Fixed geometry across states | PASS shared 26px rows, compact22px, fixed value widths |
| Poppins labels / Source Code Pro game numbers | PASS computed styles; table fonts unchanged |

## Filter pill checklist

| Requirement | Result / evidence |
|---|---|
| Off/hover/on/disabled tokens, constant label | PASS prototype values and computed styles |
| 40px and 32px variants | PASS shared tokens/rendering; 32px used for dense page controls |
| Optional count/caret | PASS tests and browser |
| Exclusive segment / independent toggles | PASS tests; OR inside each multi-filter and AND between filters |
| Dropdown active ring when selected | PASS browser Teams/Pos controls |
| Tab ring, Space/Enter, keyboard options | PASS 7 shared-control tests; nonsearchable dropdown focuses first/selected option, Escape returns trigger |

## Deliberate adaptations

- Accurate official helmet product PNGs replace the manifest's generic marks at Robert's explicit request. Provenance and SHA256 values are in public/logos/nfl/sources.json; no hotlinks.
- Season, scoring, base/DFS week, slate, metric and research-team selectors stay exclusive because they define one data context. News league scope stays one ordinal to preserve the detached-window messaging contract. Other composable filters accept multiple selections.
- Team Box's independent matchup composes with its existing chronological range, as required by AGENTS.md; it does not silently reset the range.
- Unknown odds, clocks, possession and missing historical DFS captures remain —. A kickoff timestamp alone never invents a live state.
- Coarse-pointer pill targets expand to 44px for accessibility. Dropdowns use fixed portals to avoid clipping by dense table containers.

## Verification

- npm run check: PASS (exit 0), including 24 UI files / 216 tests, market and waiver checks, warehouse/importer checks, build and deployment-contract checks.
- npm run lint: PASS.
- Independent read-only review: PASS, no remaining findings.
- No warehouse, API contract, endpoint, credentials, Yahoo storage, news poll interval or detached-message changes.
- Deployed candidate and permanent production verification are recorded separately with exact release IDs after publication.

Release probe correction: after Sunday kickoff, the existing app selects the largest unlocked Classic slate (Primetime 154083 at verification). The verifier now independently checks that time-based rule and every current identity, then explicitly requests stored default 154080 for the unchanged >250-player broad coverage gate. Candidate passed 496 checks with 359 broad-slate identity joins. No application behavior or source values changed.

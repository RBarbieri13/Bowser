# Compact controls release review — September 17, 2026

Request: one consistent, collapsed top controls area per active page, preserve all unique functionality, hide League Hub/Fantasy Intelligence, condense Team Box, and add the official Thursday DFS slate.

## Implementation and independent review

Parallel owners: Team Box; Waivers/Opportunity; DFS importer/archive. Integration: Players, Market Pulse, Game Breakdown, shared PageControls, navigation. Independent cross-page review and separate independent DFS review both PASS.

- Preserved native column settings, sorting, resizing, favorites and budgets, every unique filter, schedule/week choices, all trend metrics/windows, player links and dated provenance. Removed only the duplicate Player Database settings opener.
- One collapsed disclosure per primary page. Hidden controls remain mounted, preserve values, and leave keyboard navigation when closed. Errors and primary actions remain visible.
- Team rows32px on desktop,46px on touch; matchup block once, compact week/stat headers thereafter.
- Game Breakdown participation table verified468px viewport after moving its controls; production mode and sort survive collapsing.
- At390px: Players/Waivers/Market document and panel overflow corrected; action buttons remain inside viewport, DFS selector fits, and query controls form three separate44px rows. Opportunity and Team controls also fit. Existing table horizontal scrolling is retained.
- Desktop table top (viewport pixels,1600×1000): Players356→109; Waivers296→107; TeamBox497.5→91; Market237.7→107. Opportunity first player row806.4→197. Each page has exactly one collapsed PageControls.
- Scrolled Opportunity→Market navigation restores the top header.

## DFS evidence

Official Thursday September17 DET@BUF8:15PM ET draft group153434 is full-game Showdown.94 official salary entries =47players×FLEX/CPT;22 sourced projections per role. Player APIs expose44 stable-ID matches and21 matched projections per role; table rows remain unique. GibbsFLEX$12,000/23.2; CPT$18,000/34.8. Captain projections explicitly derive from sourcebase×1.5; salary is the official role-specific value. Missing source projections remain null. Actual Week1 fantasy finishRB3 is unchanged by role.

All20 baseline captures and10,735 baseline records preserved unchanged; immutable-history-proof.json documents the comparison. Archive now86captures/25,108records. Multiple legitimate dated captures of refreshed sources/provenance remain append-only. Current Classic818salaries/393projections, plus all16full-gameShowdowns. Published-source removals reduce current projection coverage; prior captures retain previous values.

## Checks

Focused: Team8; Waivers/Opportunity21; root existing UI/Market regression44; shared disclosure2; importer22Python; DFS17Node: PASS. Full npm run check and candidate/public readbacks are recorded in production-release.json after completion.

Initial full check hit an existing250ms query-time threshold under simultaneous browser review (276ms); no assertion was changed. Final check runs after browser sessions close. Browser development console's single websocket disconnect came from the dev server restart during package script changes, not application runtime; production console is checked separately.

Screenshots are saved under output/playwright/compact-controls (excluded from deployment/Git); final public screenshots and probes will be captured after promotion. Detailed source caches and test logs remain under artifacts/compact-controls/dfs and /private/tmp.

Final release: full npm run check PASS; local/candidate/public483 assertions each PASS; public five-page desktop disclosure and loaded table verification PASS; narrow panels and Thursday Captain values PASS; no public runtime page errors. Main alias resolved to dpl_Ec3cCU7UH1981ddmyGj1qJe6E1aB READY. Fresh Market browser required the existing Refresh data action to initialize real snapshots; refreshed1016 players, no alerts.

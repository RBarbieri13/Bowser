# Independent LineupHQ visual and interaction review

Date: 2026-09-27. Scope: seven-route conversion, screenshot/source review only. No browser use, app mutations, or UI source edits performed.

## Evidence and verdict

Viewed every saved screenshot pair in `screenshots/01-*` through `06-*` using `view_image`, and all seven original `handoff/lhq-images/*.jpg`. Read the conversion handoff, current checkout AGENTS.md, and current `src/lhq` implementation. Inspected relevant prototype HTML for interactive count control and diverging movers anatomy.

**Verdict: exact visual/interaction contract not yet verified.** The shell, typography, table density, source controls, table groups, position windows, real-data null handling, and primary page anatomy are substantially aligned. Remaining source-confirmed differences below should be repaired or explicitly accepted. New captures are needed because current source already repairs several defects visible in the saved captures. No League Hub current screenshot was supplied; source alone cannot verify its final appearance.

Review honors Robert’s latest overrides: stat widths may resize and must synchronize across all weeks/positions; sidebar may shrink to 240px or hide; horizontal overflow with the sidebar open is allowed. Differences in real players, statistics, dates, available sources, authorized leagues, missing projections, and current authorization are not visual failures. Never substitute prototype sample data.

## Prioritized current findings

1. **P1 — responsive sidebar does not reliably auto-collapse below 1100px.** `shared.jsx: Shell` computes `savedHidden ?? (defaultHidden || innerWidth < 1100)` without a resize subscription. A saved open preference also wins over narrow viewport width. Reproduce by opening the sidebar at 1920px then narrowing below 1100px; no React state update necessarily occurs. Handoff acceptance requires auto-collapse. Preserve desktop preference while reacting to a media-query boundary; verify 1099px collapse and main-pane space recovery, plus deliberate user opening if supported.

2. **P1 — nav sort context contradicts actual grid sort.** Player Database, Waivers, and Market Pulse hard-code USING Fpts/FPTS/Adds while leaf clicks change `sort`. Saved `03-market-pulse.png` shows USING Adds with the News leaf sorted. Derive the nav label from current sort and make its action clear; do not display a dropdown caret if it merely resets one sort. Check each route after sorting a different numeric column and a string column.

3. **P1 — SHOW count controls removed.** These same three routes render one static `SHOW {rows.length} PLAYERS USING` label. The prototype has a compact 40px input, and Player Database prototype binds `limitText` to `setLimit`, so this is a lost interaction as well as a geometry difference. Reinstate an accessible row-limit input with the prototype dimensions and clear total/shown counts. Verify entering a limit changes only displayed rows, preserving source totals and filtered data semantics.

4. **P2 — Opportunity movers lack signed diverging geometry.** `OpportunityTracker.jsx: panelMovers` gives both positive and negative `<i>` bars the same left-origin percentage; color alone changes. The prototype has a 90px center-zero track split into 45px left/right halves, with red negatives extending left and green positives right. Current CSS fixes the old screenshot’s clipped names but does not implement diverging bars. Restore centered signed bars, a header band, and compact 40px rows; verify with one positive and one negative delta.

5. **P2 — Team Box active SORT WEEK state is not rendered.** `lhq.css` defines `.lhq-week-sort.active` amber, but `TeamBoxScores.jsx` always renders only `className="lhq-week-sort"`. Match the current per-position sort’s week, including after leaf clicks, so exactly the owning week is amber. The current source already improved title totals and kickoff display compared with the saved screenshot.

6. **P2 — Team and league menus use native selects instead of full-width choice panels.** `shared.jsx: Picker` is always a native `<select>`; Team Box/Opportunity team pickers and League Hub scope reuse it. Handoff §1.6 requires a top-50px full-width dark menu, eight columns for teams/five for league scope, selected green text plus checkmark. Native menus are functional but do not satisfy the specified opened-state geometry. Verify keyboard selection, Escape/outside dismissal, and menu geometry if implemented.

7. **P2 — Player Database Position Totals loses top-player identity.** The final cell renders only `Math.max(...known)`; prototype shows the top player’s name plus points, and the Avg Fpts column is green. Preserve sourced totals but include the real top player name and point value, with a tooltip if necessary at the 367px default sidebar width.

8. **P2 — Player Database Manage Columns and trend toggle anatomy incomplete.** Current modal uses a flat two-column checkbox list and normal position chips, without the prototype’s column-group sections, pill tabs, Show All/Done controls, or the Options “Show trend columns” toggle. Real hiding works, which is good, but the contract includes these controls and geometry. Add a group-level trend toggle and preserve individual hidden selections when toggling it, or document an explicitly accepted alternative.

## Already repaired after saved screenshots (re-capture, do not regress)

- Waivers current source uses neutral source rank values (rank 1 bold), neutral FAAB values with `basis unknown`, always renders empty favorites table headings, adds current observed team-add totals, and supplies FAAB mode note. The saved capture predates those repairs.
- Market current source formats large Net values as integers, and sidebar player tooltip wrapper now displays as a block, separating player identity from its subline. Saved capture shows the old colliding inline name/position.
- Opportunity current CSS constrains chart context and player metadata, and replaces the old malformed movers placement. A fresh screenshot must confirm name visibility at 420px and 240px.
- Yahoo current CSS restores the primary nav action’s filled style, source opacity, compact connected steps, and a larger status strip. The local unconfigured-state warning legitimately shifts the grid downward and disables authorization actions; it is not a design defect to suppress.
- Team Box current source adds readable formatted kickoff, position total points, and sourced latest/position sidebar statistics absent from the saved screenshot.

## Remaining verification boundary

Capture all seven routes again at 1920×1080 and narrow width after final edits, especially League Hub and the repaired Opportunity/Yahoo sidebars. Exercise Options, count limits, sort labels, sidebar collapse/resize, full-width pickers if added, and per-week active sorting. Use genuine empty states for private Yahoo data; a public screenshot cannot establish live authorized account access. This review does not certify npm checks, a release, or connected Yahoo functionality.

## Final capture re-review (second pass)

Viewed all seven refreshed `*-app.png` captures and `07-prototype.png`, then re-read current source. `01-players-app.png` is fully loaded, with 410 sourced rows: no loading-race failure in that artifact. League Hub now has direct visual evidence: its shell, workspace tabs, module bands/headers, and truthful unsynced states are coherent. Omission of four invented league identities is correct. Yahoo configured-state differences are likewise legitimate.

The count controls, live sort pickers, column-group modal/Show All/Done, trend toggle, full-width Team/League picker, and active SORT WEEK class are now implemented. Parent reports browser evidence for 8-column team menu at y=50, synchronized SNP 36→40 resizing across 12 headers, 36px rows, and permitted horizontal scrolling with the sidebar open. These reported browser results are distinct from this independent image/source inspection.

**Second-pass verdict: FAIL pending two concrete visual repairs.**

1. `05-opportunity-app.png`: all Biggest movers player names remain pushed into the far-right delta column and clipped. Root cause: `.lhq-mover span{grid-column:3}` also matches the outer `PlayerName` tooltip span (`.lhq-tip-anchor`). Set that direct child to column 1, row 1, with `min-width:0`; reserve column 3 for only the direct delta span. The signed diverging track itself is now implemented correctly. Fresh image must show complete/appropriately clipped names inside the left identity area, visible signed values, and compact rows.
2. `01-players-app.png` and `02-waivers-app.png`: sorted right-pinned Fpts/FPTS headers show underlying scrolled header text through them. The sorted gradient ends transparent and lacks an opaque background color. Retain gradient but give sticky sorted leaf headers an opaque base (e.g. #1f1f1f). Fresh image must show a single readable Fpts/FPTS label with no other header glyphs visible beneath it.

Source-only edge: sidebar crossing below 1100 now collapses after 150ms, but initial narrow mount with session savedHidden=false can still open it. Clarify this as deliberate saved preference or collapse once on narrow mount. This is not a failure demonstrated by the supplied desktop captures.

No browser actions or UI edits performed by this reviewer. Only this review artifact was appended.

## Third and final visual verification

**PASS — no remaining visual release blocker in the reviewed seven-route conversion.** This supersedes the first and second pass failures above.

Re-opened the refreshed `01-players-app.png`, `02-waivers-app.png`, and `05-opportunity-app.png` with `view_image`, and verified current CSS/source. Both concrete second-pass blockers are resolved:

- Player Database and Waivers pinned sorted Fpts/FPTS headers now have a single clear label. Source confirms opaque `background-color:#1f1f1f` behind the retained sorted gradient. No underlying header glyphs bleed through in either capture.
- Opportunity Biggest movers now has legible player names in the left identity column, centered signed tracks, and readable deltas at right. Positive bars extend right, negative bars extend left. Source scopes delta placement and explicitly assigns the tooltip/name wrapper to column 1. All six shown names and signed values fit the current sidebar.
- Sidebar source now collapses once on initial mount below 1100px as well as on a debounced downward viewport crossing, closing the saved-open narrow-mount edge.

All seven routes were visually reviewed across the second and third passes. League Hub and Yahoo preserve real empty states; no invented league identities or illustrative Yahoo data are required for this pass. This verdict covers the reviewed visual/interaction conversion under Robert’s width/scroll overrides. It does not claim literal pixel identity for source-dependent content, nor does it certify live Yahoo authorization, production deployment, or repository test completion. Those remain separate documented verification boundaries owned by the parent release workflow.

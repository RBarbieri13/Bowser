# Usage Share sidebar — build handoff for Codex

**Scope (exactly two things, nothing else):**
1. In the **shared sidebar shell** (`src/lhq/shared.jsx`) replace the vertical accordion section list with a **horizontal tab strip** (`role="tablist"`) on **every route** — Player Database, Waivers, Market Pulse, Team Box Scores, Opportunity Tracker, League Hub, Yahoo Connection. Each route's existing sections become its tabs, in their current order; section *contents* are untouched. Player Database additionally gets the new **Usage share** tab.
2. Build the **Usage share** view (Player Database) as an exact replica of the prototype (reference images below). No other section's content changes.

**Reference (open both, 100 % zoom):**
- `handoff/usage-share/usage-share-sidebar.png` — the finished view at the 400 px sidebar default (NYG · RB; the two dropdowns read "ARI / QB" only because the capture tool clones the DOM — live they read NYG / RB).
- `handoff/usage-share/usage-share-tabs.png` — the tab strip.
- Live prototype: `Bowser Sidebar Prototype.dc.html` → `#/players` → **Compare / research** → **Usage share**. Source of truth for every inline style: template in that file (search `v.usage`), logic in `proto/views.js` (`function usage`).

Every value below is from the prototype; when this document and the prototype disagree, the prototype wins.

---

## 1. Horizontal tab strip (shared sidebar shell · all seven routes)

Change the shell once, in `src/lhq/shared.jsx`: the stacked 44 px accordion headers become one tab strip directly under the green **HIDE SIDEBAR** bar, and every route feeds its existing section list into it. The rest of the shell (width 240–760 px, splitter, hide/show, collapsed on route entry, `sessionStorage` width) is unchanged. Only one tab body is mounted at a time (same as the accordion today), so child-state behaviour is exactly what it is now.

```
┌ HIDE SIDEBAR ─────────────────────────────── ▶ ┐   28px, #3ecf8e, text #06301c 12px/700 uppercase
├────────────────────────────────────────────────┤   8px gap
│ Filters │ Totals │ Player │ Usage share │ More ▾│   36px tab row, border-bottom 1px #2e2e2e
├────────────────────────────────────────────────┤
│ Depth: current · captured Sep 28 15:17 UTC     │   clock line, 10px #9e9e9e, wraps, gap 2px 10px
│ Stats: 2025 W17 → 2026 W3 · calendar weeks · PPR│
├────────────────────────────────────────────────┤
│ …active tab body (#181818, padding 12px 14px 16px, single vertical scroller)…
```

**Tab row** — `display:flex; align-items:stretch; margin-top:8px; border-bottom:1px solid #2e2e2e; position:relative;`
**Tab button** — `flex:1; height:36px; line-height:36px; text-align:center; font-size:14px; font-weight:700; padding:0 8px; white-space:nowrap; overflow:hidden; cursor:pointer;`
- active: `color:#3ecf8e; background:#181818; border-bottom:2px solid #3ecf8e`
- inactive: `color:#b4b4b4; background:#1f1f1f; border-bottom:2px solid transparent`
- `role="tab" aria-selected`, focus ring `outline:2px solid #3ecf8e; outline-offset:1px`; ← → arrow keys move the active tab (W3C tabs pattern).
**Overflow** — do **not** cap the visible count at three; show as many tabs as fit at the current width, the rest go into a right-aligned **More ▾** button (`height:36px; padding:0 10px; font-size:13px; font-weight:700; background:#1f1f1f; color:#b4b4b4`, turns `#3ecf8e` with a green underline when the active tab lives inside it and shows that tab's name instead of "More"). Its menu: `position:absolute; right:0; top:36px; background:#1f1f1f; border:1px solid #3e3e3e; min-width:170px; box-shadow:0 8px 20px rgba(0,0,0,.5)`, items `padding:8px 14px; font-size:14px`, hover `#262626`. Recompute what fits from the sidebar width (rule of thumb: ≥ 96 px per tab; below 300 px sidebar width use the short labels below at 12 px).
**Tab order and labels per route (long / short ≤300 px)** — order is each route's current accordion order; the short label is the first word unless given:
- Player Database: Filters & settings / Filters · Position Totals / Totals · Selected player · statistics / Player · **Usage share / Usage** (new, inserted after Selected player) · Depth chart / Depth · Team schedule / Sched · Game statistics / Games · DraftKings lineup cards / DK
- Waivers: Favorites · Waiver options / Options · Yahoo league research / Yahoo · Depth chart / Depth · Sources · Filters & settings / Filters
- Market Pulse: Most added · Watch list / Watch · Yahoo league research / Yahoo · Filters & settings / Filters · Source history & news / News
- Team Box Scores: Latest game / Latest · Position Totals / Totals · Markers & leagues / Markers · Filters & settings / Filters · Selected player · statistics / Player · Depth chart / Depth · Playing time tracker / Time · Team schedule / Sched · Slate salaries & lineup cards / Slate
- Opportunity Tracker: Biggest movers / Movers · Filters & settings / Filters · Depth chart / Depth · Team schedule / Sched · DraftKings lineup cards / DK · Reading the tracker / Guide
- League Hub: Information needed / Info · Player exposure / Exposure · Standings snapshot / Standings · League research / Research · Filters & settings / Filters
- Yahoo Connection: Status · Privacy & scope / Privacy · What unlocks / Unlocks · Filters & settings / Filters

**State:** default tab on a route's first open = that route's current default section (Position Totals, Favorites, Most added, Latest game, Biggest movers, Information needed, Status). Afterwards restore the last tab per route from `sessionStorage` (`bowser:lhq:sidebar-tab:{route}`). Navigation still collapses the sidebar; reopening restores the tab. The research glyph / "open X" actions that today expand a specific section now select that section's tab. Keep child section state mounted-or-saved exactly as today — this change is layout only.
**Clock line** (new, under the tabs, before the body, on every route): the active tab supplies 0–3 short strings (existing sections may supply none); Usage share supplies `Depth: current · captured {depthCapturedAt}` and `Stats: {firstWeek} → {lastWeek} · calendar weeks · {scoring}`.

## 2. Usage share view — anatomy (top → bottom, all inside the 12/14 px body padding)

### 2.1 Controls row — `display:flex; gap:6px; align-items:center; flex-wrap:wrap`
- **Team select** `flex:1; min-width:70px` and **Position select** (QB/RB/WR/TE) `flex:1; min-width:64px`, both `font-size:13px; font-weight:700; background:#121212; color:#ededed; border:1px solid #3e3e3e; border-radius:3px; padding:4px 6px`.
- **Follow toggle** button: `font-size:10px; font-weight:700; padding:4px 8px; border:1px solid #3ecf8e; border-radius:2px; white-space:nowrap`. On = label **Follows selection**, `background:#3ecf8e; color:#06301c`. Off = label **Pinned**, transparent bg, `color:#3ecf8e`. `aria-pressed`.
- Behaviour: while **Follows selection** is on, a row click (mousedown) in the main table with a QB/RB/WR/TE sets team + position + focus to that player. Changing either dropdown clears focus (first depth player becomes focus). Clicking a player name inside the matrix sets focus **and switches the toggle to Pinned**. Focus and pin survive tab changes and sidebar collapse.

### 2.2 Context line — `display:flex; justify-content:space-between; font-size:10px; color:#9e9e9e; white-space:nowrap; overflow:hidden`
Left, `font-weight:700; text-transform:uppercase`: `{TEAM} {POS} · OFFICIAL DEPTH · {Mon D} · {n} PLAYERS` (when depth comes from the official nflverse chart). Right: `Focus: {player name}`; append ` · showing 6 of {n}` when the group is capped (see 2.5). *(The depth-legend list that sat here in an earlier draft is intentionally removed.)*

### 2.3 Heat-map matrix — `<table style="width:100%; border-collapse:collapse; font-size:12px; table-layout:fixed">`
**Header row** — height 26 px. Cells `font-size:10px; font-weight:800; color:#ffffff`.
- col 1 `width:88px; text-align:left; text-transform:uppercase; padding:0 4px` → `STAT · PLAYER` (70 px when sidebar < 300 px)
- 5 week columns, `text-align:center` → labels like `25·17 25·18 26·1 26·2 26·3` (`YY·W`). A week that is **not yet in the warehouse** keeps its label but in `#9e9e9e`.
- last col `width:42px; text-align:right; padding-right:4px` → `5-wk`

**Stat block header** — one `<tr>` per stat, height 22 px, single `<td colspan=7 style="padding:0">` containing
`<div style="margin-top:6px; padding:2px 4px; font-size:10px; font-weight:700; text-transform:uppercase; color:{hue}; background:rgba({hue},.12); border-bottom:1px solid rgba({hue},.5)">{LABEL}<span style="font-weight:400; color:#707070; text-transform:none; margin-left:6px">max {blockMax}</span></div>`

**Player row** — height 22 px; background `#1c2b24` for the focused player, transparent otherwise.
- col 1: `padding:0 4px; white-space:nowrap; overflow:hidden`, whole cell is a `<button>` (all:unset) → `<span style="font-size:9px; font-weight:700; color:{playerColor}; margin-right:4px">{RB1}</span><span style="color:{#3ecf8e if focus else #d8d8d8}; font-weight:{700 if focus else 400}">{Last name}</span>`. Last name strips `Jr. / Sr. / II / III / IV` (Tyrone Tracy Jr. → **Tracy**). Depth tag = `{depthPosition}{depthRank}` from the official chart (so a fullback shows **FB1** inside the RB group); no rank → `—`.
- 5 value cells: `<td style="text-align:center; padding:1px"><span style="display:block; line-height:18px; border-radius:1px; background:{shade}; color:#ffffff; font-weight:{700 if week leader else 400}">{value}</span></td>` with `title="{Player} · {week} · {stat} {value}"`.
  - **shade** = `rgba(hue, 0.10 + 0.68 × value ÷ blockMax)`; blockMax = max observed value in this block across the shown players and five weeks (min 1).
  - **week leader** = highest value in that week's column within the block, only when > 0.
  - **gap** (no recorded game / stat not in that capture): text `—`, `background:#121212; color:#4a4a4a`, title explains why (`no recorded game` / `not in 2025 capture`). Never render 0 for a gap.
  - Fpts one decimal; everything else integer.
- last col: `text-align:right; padding-right:4px; font-weight:700; color:{#3ecf8e if focus else #d8d8d8}` → 5-week sum over observed weeks (`—` if none).

**Player colours** (depth tag only): focus `#3ecf8e`; others in depth order `#5aa9ff, #f2ae49, #a87cff, #e8735a, #d8bf79, #b4b4b4, #72e3ad`.

### 2.4 Stat sets and hues (one hue per block, never repeated inside a set)
| Pos | Blocks in order → hue |
|---|---|
| WR / TE | Snaps `#3ecf8e` · Targets `#a87cff` · Rec `#5aa9ff` · Rec yds `#f2ae49` · Rec TD `#e8735a` · Fpts `#d8bf79` |
| RB | Snaps `#3ecf8e` · Carries `#a87cff` · Rush yds `#f2ae49` · Targets `#2fc4b2` · Rec `#5aa9ff` · Fpts `#d8bf79` |
| QB | Snaps `#3ecf8e` · Pass att `#a87cff` · Pass yds `#5aa9ff` · Pass TD `#e8735a` · Rush att `#2fc4b2` · Fpts `#d8bf79` |

(Rule used to derive these: base map snaps→green, targets/pass att/carries→purple, receptions/pass yds→blue, yards→orange, TDs→coral, Fpts→gold; if a hue is already used in the set, take the next spare from `#2fc4b2, #d979d9, #72e3ad`.)

### 2.5 Group, window, footnote
- **Group** = players on the team's **official depth chart** for the selected position (nflverse depth feed, same source the Opportunity Tracker already uses), sorted by depth rank; unranked players last. Show the first **6**; if more exist, add a text button under the table `+{n} more on the depth chart` / `Show top 6 only` (`font-size:11px; color:#3ecf8e; height:26px`).
- **Window** = the last **5 aligned calendar weeks** ending at the current stats week (labels `YY·W`), the same aligned arrays the trend charts already consume. Missing observations are gaps.
- **Footnote** — `font-size:10px; color:#707070; line-height:1.5`: "Shade is relative to each stat block's max (shown in the header); the week leader is bold; — is a gap, never zero. Click a name to focus that player."
- Body is one vertical scroller (the sidebar body); the table never scrolls horizontally — at 240 px the 88 px first column becomes 70 px and everything else flexes.

## 3. Data (real endpoints, no mocks)
- Depth + roster status + capture time: `GET /api/v1/opportunity-tracker?season&team&weeks&games&scoring` already returns `depthPosition`, `depthRank`, `rosterStatusLabel` and `history[]` with per-week `snaps / passAttempts / completions / passingYards / passingTds / rushAttempts / rushingYards / rushingTds / targets / receptions / receivingYards / receivingTds / fantasyPoints / played / missingReason`. Use it as the single source for this view (one request per team; cache per team/season/week in the route's state).
- Field mapping: Snaps `snaps`; Targets `targets`; Rec `receptions`; Rec yds `receivingYards`; Rec TD `receivingTds`; Carries `rushAttempts`; Rush yds `rushingYards`; Pass att `passAttempts`; Pass yds `passingYards`; Pass TD `passingTds`; Rush att `rushAttempts`; Fpts `fantasyPoints` under the app-level scoring.
- Gap rule: `played === false` or field `null` → gap cell. Team's snap % is not shown here.
- Clock strings come from the same response (`dfs_meta` is not used; depth capture time is the roster/depth captured-at already surfaced on Opportunity Tracker).

## 4. Acceptance
- Every route's sidebar shows the horizontal strip with all of that route's sections as tabs (Player Database: eight, including Usage share), overflow into More ▾ at narrow widths, 36 px tall, active tab green with 2 px underline; section contents render exactly as before.
- Usage share matches `usage-share-sidebar.png` at 400 px: 26 px white/800 header row, 22 px block headers with hue band + rule, 22 px player rows, 18 px line-height value chips, all values white, leader bold, gaps `—` on `#121212`, focused row `#1c2b24`, 5-wk column bold.
- Clicking a main-table row while **Follows selection** is on re-targets team/position/focus; clicking a name in the matrix focuses it and flips the toggle to **Pinned**; changing team/position resets focus to the top depth player.
- No horizontal scrolling inside the sidebar at 240 px; no Poppins/Source Code Pro in this view (Helvetica Neue stack).

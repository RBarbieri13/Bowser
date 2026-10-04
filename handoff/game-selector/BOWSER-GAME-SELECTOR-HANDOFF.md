# Bowser — DFS Game Selector (helmet matchup boxes)

Replaces the existing DFS matchup selector strip on **Player Database, Waivers, Team Box Scores, Fantasy News**. One shared component, four mount points. Prototype is the source of truth: `prototype/Bowser Game Selector.dc.html` (lift exact px/hex from its inline styles).

## 1. What changes
- Old strip (two-line team/total text cards with faint borders) → horizontal row of **game boxes**: status line on top, two team rows (helmet · abbr · value) below.
- An **All** box leads the row with the game count.
- Selection is **visible on the box itself** (green ring + tinted fill); non-selected boxes fade to 45% while any filter is active.
- Same data as today (slate games, kickoff, total, spread, live score if available). No new endpoints.

## 2. Anatomy (per box)
```
┌─────────────────────────────┐  248 × ~96px, radius 10px
│ 4th Quarter 2:11          ● │  status 12.5px/500; live dot only when in-progress
│ ▍🏈 MIN                  34 │  row 26px: poss-bar 3px · logo 28×28 · abbr 15px/600 · value mono 15px/700
│  🏈 MIA                  13 │
└─────────────────────────────┘
```
- Container: `background #181818`, `border 1.5px solid #262626`, `border-radius 10px`, `padding 10px 12px 10px 10px`, column gap 6px.
- Row grid: `grid-template-columns: 4px 32px minmax(0,1fr) auto; gap 8px; height 26px`.
- Logo: official team mark, 28×28 `object-fit: contain`, in a 32px column. Source files: `nfl-logos.json` (500px transparent PNGs, one per team; note the `WAS → wsh` slug). Download once into `/public/logos/nfl/{ABBR}.png` and serve locally. Do not mirror logos (wordmarks would read backwards).
- Abbr: Poppins 15px/600 `#EDEDED`, ellipsis on overflow.
- Value: Source Code Pro 15px/700, right-aligned, `min-width 40px`.
- Possession bar: 3×14px, radius 2, `#3ECF8E` on the team with the ball, transparent otherwise (keeps the grid stable).

## 3. States
| State | Border | Fill | Status text | Value text |
|---|---|---|---|---|
| Default | `#262626` | `#181818` | `#8A8A8A` | see below |
| Hover | `#262626` | `#202020` | — | — |
| Selected | `#3ECF8E` | `#15241D` | — | — |
| Faded (another game selected) | default | default | opacity .45 whole box | — |
| Live | default | default | `#EDEDED` + 6px green dot w/ `0 0 0 3px rgba(62,207,142,.18)` halo | leader `#3ECF8E`, trailer `#EDEDED` |
| Final | default | default | `#8A8A8A` ("Final", "Final · OT") | winner `#3ECF8E`, loser `#8A8A8A` |
| Pre-kick | default | default | `#8A8A8A` ("Sun 4:25 PM") | favorite row = spread (`-3.5`), other row = total (`o47.5`), both `#8A8A8A` |

**All box**: 64px wide, same radius/border. Unfiltered: green ring, `#15241D` fill, "All" `#3ECF8E` 14px/600, count `#8A8A8A` 11px. Filtered: grey ring, `#8A8A8A` text.

## 4. Behavior
- Click box → filter to that game. Click selected box again → clear. Click All → clear.
- Shift/⌘-click → add/remove game from a multi-selection (existing multi-game behavior preserved).
- Strip scrolls horizontally; `gap 10px`; thin 6px scrollbar `#2E2E2E` thumb.
- Keyboard: boxes are `<button>`s — Tab/Enter/Space work natively. Keep `title="MIN@MIA"` for tooltips.
- Filter state is the same object the current selector writes to; only the renderer changes.

## 5. Data mapping
| Field | Source |
|---|---|
| status | `game.state === 'in' ? "{quarter} {clock}" : game.state === 'post' ? "Final[ · OT]" : kickoff formatted "Sun 4:25 PM" (ET)` |
| away/home abbr | slate game `awayTeam`/`homeTeam` |
| logo | `/public/logos/nfl/{ABBR}.png` fetched from `nfl-logos.json` |
| value (pre) | DFS lines: total → `o{total}`; spread → favorite's negative number |
| value (live/final) | live score feed already used by Team Box Scores |
| possession | live feed `possession` team abbr; omit when unavailable (bar stays transparent) |
| live dot | `game.state === 'in'` |

## 6. Page-specific notes
- **Player Database / Waivers**: mount directly above the table where the current strip lives; keep the existing left-side **All** behaviour but render it with the new All box.
- **Team Box Scores**: this strip *is* the game picker; selecting a box loads that box score. Single-select only (no shift-add).
- **Fantasy News**: replaces the matchup chips in the status-table filter. Multi-select allowed.
- Density scale: if the page is in Compact density, scale box width 248→220 and row height 26→22; font sizes unchanged.

## 7. Acceptance
- [ ] Every slate game renders as a box; All box first; horizontal scroll on overflow.
- [ ] All 32 logos load from local `/public/logos/nfl/`, 28×28, crisp on 2× displays.
- [ ] Pre-kick boxes show spread on the favorite row and total on the other row.
- [ ] Live boxes show green dot, clock, leader in green, possession bar.
- [ ] Final boxes show "Final", winner green, loser grey.
- [ ] Selected box: green ring + `#15241D` fill; others fade to .45.
- [ ] Clicking a selected box or All clears; shift-click multi-selects (except Team Box Scores).
- [ ] No layout shift between pre/live/final (fixed row height, min-width on value).
- [ ] Poppins for text, Source Code Pro for numbers; nothing else on the page changes.

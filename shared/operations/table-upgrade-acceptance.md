# Bowser table upgrade acceptance — September 16, 2026

> Historical release record. The shared settings dialogs and expanded filters were reverted at Robert's request on September 17. See `table-controls-rollback-20260917.md` for the current UI scope.

| Surface | Settings / filtering | Sort / resize | Player navigation | Trends |
|---|---|---|---|---|
| Player Database | Existing column studio, views, visibility, density, source/week/scoring/position/team filters; dated DFS selector | Headers, multi-sort, column/group resize | Shared profile, including depth-popover names | Shared 19-stat menus; 5/8/10/18 regular-calendar weeks |
| Market Pulse | Shared staged settings, views, formatting, source/identity and numeric ranges | All headers, multi-sort, drag/keyboard resize | Shared profile; separate source-history button | Provider-specific metric menus and 5/10/16/32/96 observations; signed common scales |
| Waivers | Shared staged settings, numeric preset, source rank/FAAB ranges, position/team/week/budget/favorites | Headers, multi-sort, resize; reorder inside labeled groups | Shared profile for targets and favorites, conservative identity lookup | Three shared metric menus and 5/8/10/18 calendar weeks |
| Team Box Scores | Shared settings, year/schedule/scoring/position/team/search/marker/numeric filters | Semantic synchronized widths, weekly headers and sorting | Shared profile | Multiple insertable draggable/keyboard-movable charts, anchored to left week; 19 metrics, 5/8/10/18 weeks |
| Opportunity Tracker | Tailored settings per position; schedule/year/scoring/roster/team, search and numeric ranges | Every column sorts and resizes | All roster players, including no-game profiles | Three shared metric selectors per position, common calendar/domain and history window |
| Player Profile | Logs, heat map and season tables have settings/search/numeric ranges; logs phase filter | Every statistical header sorts/resizes | Same common modal; depth-player navigation | Shared metric dropdown and calendar window, selection preserved on reload |
| Game Breakdown | Participation settings/search/numeric filters, team and opportunity/production modes | Player/segment/total headers sort by chosen KPI; resize | Shared profile | Same-game segment bars retain four separate KPI lanes; this is not historical NFL-week data |
| Intelligence | Table and analysis-card views; existing freshness/position/impact/search plus settings/numeric ranges | Table headers sort/resize | Shared profile in both layouts | Sentiment is an event score, not an invented historical game series |
| League Hub / source registry | Existing platform/league/status context; no connected private statistical table | Not applicable to unconnected league placeholders / source cards | No private player roster is invented | None |

Actual weekly positional finishes rank NFL peers before filters. Team weekly DFS is exact season/week; upcoming rows keep actual statistics/rank null. Current and historical DFS contexts are explicit in Player Database and Opportunity Tracker. Archives retain immutable content captures plus a per-slate active pointer so recovered source values become current without rewriting history.

Verification: full npm check; independent UI, Team/Market and archive reviews; source-backed API readbacks; browser checks of settings visibility, profile metric/window preservation and 42-snap source value, Team Box trend windows, and public deployed routes. Detailed run evidence lives in artifacts/table-upgrade; durable release evidence is saved beside this document.

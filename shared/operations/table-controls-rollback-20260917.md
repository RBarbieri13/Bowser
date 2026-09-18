# Requested table settings and filter rollback — September 17, 2026

Robert requested reverting the table-settings and filter changes from September 16. This release restores native page controls using commit 8e643fd as the UI reference while retaining unrelated data and trend repairs from the current production release.

- Player Database retains its original column studio and filters.
- Market Pulse restores search, position, team and watchlist controls; the new shared dialog, numeric ranges, source/identity filters and layout preferences are removed. Its table fills available width. Header sorting/resizing, player links and provider-history controls remain.
- Waivers restores the original inline Table menu and existing ranking/FAAB filters. New shared dialog, saved views, ordering and number-format controls are removed.
- Team Box restores the native Statistics picker, team/position/scoring/matchup/DK price and width controls. The shared dialog and added local year/search/marker/FPTS/projection filters are removed. Global season selection remains.
- Opportunity Tracker restores the player-card grid and existing year/week/matchup/roster/position controls. Shared table settings/search/numeric controls are removed. Weekly finish and DFS values remain.
- Player Profile restores manual game-log, heat-map and season tables; Game Breakdown restores its original participation table; Intelligence restores analysis cards. Their added table settings/search/numeric controls are removed.

Shared player profiles, chart metric/history selectors, common NFL calendars and scales, anchored draggable Team Box trends, exact-week fantasy finishes and all sourced DFS archives are preserved. No files under data/, server/, api/ or importer scripts changed. The stopped September 17 DFS refresh is not included.

Validation evidence: full npm check, 426 local/candidate/public API assertions, browser checks for restored controls and preserved player/trend behavior, plus worker scope reviews. Exact deployment and evidence results are in production-release.json after publication.

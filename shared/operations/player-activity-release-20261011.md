# Player Database activity columns — October 11, 2026

Two 114px composite columns follow Finish and precede LEFA: Sleeper and Yahoo, each with Adds / Drops / Net. Header arrows independently sort raw counts descending first; a repeated click reverses. Values abbreviate at thousands/millions; tooltips retain exact counts. The header remains 36px, and columns can resize down to 108px or hide through existing column settings.

Sleeper uses existing public top-list snapshots with selectable 6/24/72-hour windows and the 15-minute cooldown. The current observation is independent of statistical and DFS weeks. Missing sides remain unavailable and cannot produce Net. Duplicate/incomplete identities do not join. Provider failures retain the original last-good capture clock.

Yahoo uses the chosen connected league's existing bounded successful transaction observations, in memory only. The header menu states league, returned coverage, read time and event date range. These are not site-wide Yahoo counts. Unmatched players remain unavailable. Refresh all rediscovers the authenticated account; per-provider refresh is also available. No new endpoints, credentials or permissions.

Public CSV excludes composite activity/ownership columns. After sorting on private activity or ownership, CSV also excludes private-derived Rank and orders rows by public fantasy points. Existing public statistical export fields remain available.

Validation: 17 focused activity/Player Database tests; full npm run check and npm run lint; independent security review PASS after correcting private-derived CSV ranks. Real public feed browser checks confirmed source-window switching, descending numeric sorting, Net sorting, keyboard resizing and zero overflowing activity values at default width. Local Yahoo is disconnected; authenticated production checks follow release. Generated Week 5 DFS captures were refreshed through the existing importer, publishable:true, and verified offline; no warehouse edits.

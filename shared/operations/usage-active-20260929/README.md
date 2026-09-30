# Positional Usage participation filter — September 29, 2026

Players are shown only when at least one of the five displayed NFL-week slots has a sourced positive snap count. This is an any-participation rule, not a requirement to appear in every week. Missing snap history is not treated as evidence of participation. Eligibility applies before sorting to all statistical categories in both By player and Compare stat. Source rosters and other pages are unchanged.

Local verification: npm run check PASS, 158 UI tests including six Positional Usage tests. Dedicated cases cover no snaps, unavailable snaps, outside-window-only snaps, partial participation, selected inactive players, every WR category, both views and an empty group. Existing sorting tests retain unavailable metric values on players with recorded snaps.

Real-data browser check: LA WR at 2026 Base Week 3 shows seven of ten roster players. CJ Daniels, Brennan Presley and Tru Edwards have no recorded snaps in any displayed slot and are hidden. Puka Nacua and other partial-window participants remain visible with unchanged aligned gaps.

No warehouse, DFS capture, waiver snapshot or Yahoo data changes.

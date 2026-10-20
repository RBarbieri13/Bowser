# Week 7 waiver capture — October 20, 2026

109 public targets; 190 rank cells across five publishers; 108 FAAB cells across five publishers. Seven publishers total. Source evidence URLs, actual capture clocks, publication dates and content hashes are included in data/waivers-2026-week7.json. Original October 19–20 source HTML stays in an ignored local research capture, never in the public bundle.

The new snapshot is selected by the existing latest-published-week discovery. Week 2 and Week 4 remain unchanged. Statistics default to the latest completed prior week (Week 6) and can be widened independently. The release statistics contain all 93 completed games through Week 6; DFS advances independently to Week 7.

Rank columns contain explicit publisher priorities only. Fantasy Life explicitly disclaims waiver ordering, so it has no rank column. FantasyPros exposes five public consensus rows, not a fabricated complete consensus. Every normalized positional ordinal preserves its original overall priority where applicable. Source FAAB values retain units, basis, ranges, operators, tiers and qualified wording. There is no cross-basis average. Superflex/aggressive/budget selections show only published corresponding tiers; absent tiers are blank. Hover displays all source tiers.

Private recommendation files and league budgets are not in this repository. Local draft lists and user-entered budgets are isolated by season and selected Yahoo league; unassigned legacy favorites remain available. Budgets initialize unknown rather than reusing another league’s balance. No claims, bids, trades or lineup changes are submitted.

Verification: npm run check; npm run lint; independent read-only review; browser readback of latest week, source columns and tier selector; candidate and permanent deployment trend verifier. Use scripts/import_waivers_week7.py --verify for offline source schema/count validation. Rebuilding requires --html-dir pointing at the reviewed capture and its evidence.json; never overwrite historical snapshots with rolling source pages.

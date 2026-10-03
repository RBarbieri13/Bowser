# Command Center v2 comparison — October 3, 2026

Source: Bowser Design System (9), handoff/fantasy-news/FANTASY-NEWS-COMMAND-CENTER-V2-HANDOFF.md and its executable prototype. Handoff and specified reuse sources were read before implementation; the component/state plan was shown to Robert before coding.

| Area | Implementation and verification |
| --- | --- |
| Frame | At measured 1920×1080 CSS viewport: 48px app bar, 34px nav, 44px taskbar; Status dock600px; 10px gaps; title34px; body27px Status rows. Browser screenshot saved in artifacts/news-cc-v2. |
| Status | Independent inline expansion, explicit inspect, six counted tabs, source/week/game controls, header sort and pointer/keyboard resize. Sources tab follows game scope too. |
| Wire | Category/group/sort, one expanded report, source links, public status and impact, independent text scale. |
| Evidence | History30, previous/next Wire ordering, selector, outside-filter selection, pin, facts/prose/citations/related reports. Filter changes preserve selection. |
| Role | 22 source-linked curated rooms; affectedPlayers takes precedence; independent beneficiary identity for Yahoo badges. |
| Health | Separate check/publication/repository/read clocks; provider capability vs actual coverage; missing fields; top14 outlets scope Status only. |
| League desk | Hidden overlay, resizable, disconnected state; authorized league tabs, matchup slots, roster matrix, bounded free agents, news hits. Private fixture only in tests. |
| Layout | Tiles/Columns/Stack; move/maximize/close/reopen; row/column/dock grips; validated reload persistence. |
| Text | --p/--d and per-window --t/--k/--r, fixed chrome and widths; Poppins prose, Source Code Pro tokens/clocks. |
| Privacy | Sender-origin/handle checks, public-only popup synchronization, deferred ordinal hydration; no article/Yahoo payload storage. |

## Deliberate differences and limits

- Real public feed counts change (82 reports during browser verification), so the prototype's fixed 61-report/fixture-league counts are not seeded into production.
- The explicit request overrides the document's contradictory disconnected-fixture sentence: disconnected Yahoo shows no fixture leagues. Other managers/opponent rosters and unreturned league settings remain unavailable.
- A small window menu retains the existing browser-popout capability; a 60s checkbox preserves controllable stored-feed polling. No provider ingestion is triggered.
- Wire Checked ordering retains the prototype's current grouping behavior rather than forcing the document's single-group wording.
- Real player IDs retain the existing Player Card link; adjacent team-chip explicitly sets the global team filter.
- Screenshot viewport measured1920×1080 CSS pixels; IAB physical capture uses its display scale. No CSS zoom or transform is used by the page.
- One pre-reload HMR diagnostic came from changing effect dependency array size while editing. Fresh reload and subsequent interactions produced no new console errors.
- Live authenticated Yahoo was not available in the localhost session. Yahoo rendering/expiry/unknown-identity and empty-slot behavior is covered by isolated authorized test fixtures; production must remain honest about unloaded data.

## DFS investigation

Verified Week4 current Sun–Mon Classic remains2026-w4-dk-154080. Carson Wentz has a sourced0.25 projection; Jordan Mason has no exact matched source projection and DK statusIR. The importer previously skipped all supplemental defense rows and did not bridge verified roster aliases. It now matches defense by team/date/game/exact official salary, and player aliases through unique current nflverse stable ID plus same team/position/exact salary. Kenny/Kenneth Gainwell now resolves to the published6.62 projection. No fuzzy names, guessed Mason value, AvgPointsPerGame substitution, new projection provider, or warehouse mutation.

Primary Fantasy Info Central remains rejected for a source date outside the current pregame week. The existing explicitly partial refresh mode retains that rejection and uses only validated Fantasy Sports Central values. Unknown publication times remain separate from capture clocks; missing values stay null. Immutable capture history is retained.

# Bowser trend and weekly DFS repair — September 16, 2026

## Implemented

- Common regular-season calendar slots across Player Database, Opportunity Tracker and Waivers: the ten-week window ending 2026 W1 is 2025 W10–W18 then 2026 W1. Missing/bye/DNP values remain null and do not move other weeks. Both source warehouses are unchanged.
- One 19-statistic dropdown catalogue for all trend slots, persistent preferences, NFL-wide metric domains, zero baseline, and negative bars below zero. Source SQL checks cover 233,700 values. Cam Skattebo has 42 Week 1 snaps and Tyrone Tracy 2; their snap bars use the same scale.
- Opportunity year, week-range, independent matchup-week, scoring, team, roster and position filters. History windows have 5/8/10 calendar weeks. Team Box and Opportunity share schedule controls; range changes preserve independent extra weeks.
- Player Database Column options button and viewport-bounded settings. Browser checks cover desktop, 900×600 and 390×844; narrow-panel Apply was hit-tested and clicked. Legacy chart CSS that removed visible bar width was removed.
- Weekly POS FIN: NFL-wide competition rank by position and selected scoring, before team/search filtering. Multiweek totals stay cumulative; rank explicitly identifies its latest selected completed regular-season week.
- Current 2026 Week 2 DFS default: six official Classic slates, 812 all-week salaries, 752 stable roster identity matches, 192 published FIC projections. Original Week 1 data and aliases remain selectable. Unprovided projections remain null. The current statistical table includes recorded players, so roster matching coverage differs from displayed table coverage.
- Atomic weekly importer with source date/week/game/position/identity guards, unchanged detection and last-good preservation. Parser regression tests pin retained Week 2 archives while the current default can advance.

## Verification

`npm run check` passed in full. Independent semantics, current-source and UI reviews passed. The local release probe passed 417 assertions. Corrected two independent-review findings: Waiver history now survives a missing selected-week stat row, and Waiver POS FIN labels identify the exact week and scoring. Browser screenshots/logs remain under ignored `artifacts/trend-repair/`.

Read-only deployment probe: `python3 scripts/verify_trend_release.py --url https://fantasy-football-stats-preview.vercel.app --output artifacts/trend-repair/production.json`. Add `--vercel` for a protected candidate.

## Scheduling status

Weekly refresh command: `npm run data:dfs`. The proposed Thursday 8 AM Central recurring refresh would validate, check, deploy a candidate, verify and then promote verified changes. Activation is awaiting explicit user confirmation after automatic approval review rejected the scheduled deployment launch. No active schedule is claimed. The requested approval is in the Codex conversation.

Production deployment evidence will be added after candidate verification and promotion. Existing GitHub credentials could not push in the earlier release; direct Vercel deployment remains available. The original dirty Bowser checkout was preserved.

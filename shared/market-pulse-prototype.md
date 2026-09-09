# Market Pulse — bounded prototype run

Date: 2026-09-07. Base: 0313e19. Isolated branch: codex/market-pulse-prototype.

## Acceptance contract

1. Live manual refresh of Sleeper add/drop counts, with player identities, 6/24/72-hour windows, filters and sortable metrics.
2. Experimental ESPN roster/start percentages alongside Sleeper transactions in one table, with distinct source labels; never represented as Yahoo ownership or raw add counts.
3. Last-good durable snapshots survive refresh errors and process restarts; cache 15 minutes, share concurrent requests, cool down failures for one minute; retain 96 observations per provider/window.
4. Explicit source/time/coverage information, correct unknown/zero handling, no fabricated history, no summing overlapping windows.
5. Browser-usable dense Bowser page, responsive controls, keyboard-accessible selection, watchlist, export and history inspection.
6. Deterministic provider, persistence, failure and UI checks; live refresh and browser readback; complete existing check suite or disclose pre-existing failure with evidence.

Bounded execution: at most three correction passes per failing check; stop provider retries after two live failures, preserve last good snapshot. No new credentials, purchases, scheduler, public feed publication, warehouse edits or changes to unfinished News Engine work. No recurring workflow is scheduled. A manual refresh is intentionally the only network trigger.

## Measurement and access boundaries

- [Sleeper documented API](https://docs.sleeper.com/): free for non-commercial use; commercial licensing requires provider contact. Counts cover the returned trending sample, not a known share of all leagues. Top 500 per direction requested; absence is unknown, not zero. Add share = adds / (adds + drops), only when both counts are present and total is positive. Net is not a unique-user count.
- [ESPN public player page](https://fantasy.espn.com/football/players/add): experimental, undocumented public read endpoint; availability/schema may change. Roster/start percentages retain ESPN's definitions; no claim about denominator or reporting cadence. Roster change is percentage-point difference between our two latest observations, not a claimed 24-hour change. Top 1000 requested, not complete market coverage. Personal research only; public redistribution is disabled.
- Source measurements remain separate within the combined table. Match an explicit provider ID when supplied, otherwise require a unique normalized name, position and team on both sides (team identity for defenses). Never fuzzy-match ambiguous players; keep unmatched rows separate and record the match method in exports. No composite score with an invented denominator or Yahoo private league availability inference. Sleeper GSIS identifiers are preserved for a later verified warehouse join.
- History starts at the first real refresh. Samples of overlapping rolling windows must not be added together. Timestamps are capture times, not provider event times.
- Snapshots are in ignored `artifacts/market-pulse/snapshots.sqlite`, separate from the read-only warehouse. No raw cookies, credentials or private rosters.

## Run

`npm ci`, then `npm run dev -- --host 127.0.0.1 --port 4193`; visit `http://127.0.0.1:4193/#/market-pulse`. API accepts only loopback traffic and rejects Vercel execution. Launching publicly will require an access/licensing decision and an authenticated refresh service; it is not silently enabled by deployment.

Tests: `npm run test:market`, `npm run check`. Verification evidence and limitations are recorded below after execution.

## Verification — 2026-09-07

- PASS: six deterministic service tests and four UI tests. Covers unknown versus zero, ratios, validation, offline reads, simultaneous refresh coalescing, cooldowns, last-good recovery, SQLite reopening, independent windows/providers, 96-snapshot retention, public-host denial, CSV formula protection, source/window switching, watchlist persistence and visible errors.
- PASS: actual browser-triggered Sleeper refresh returned 142 players in the union of the 24-hour lists at 5:18 PM America/Chicago. ESPN refresh returned 1,000 records at 5:20 PM. Direct local API refreshes returned 140 records for 6 hours and 142 for 72 hours; the 24-hour history stayed isolated at one observation. These are recorded capture results, not promises of current counts or full-market coverage.
- PASS: browser search, player inspector, watch/unwatch, reload persistence, cached refresh readback, desktop and narrow viewport review. Resolved legacy global table minimum width and page flex clipping. Browser error log was empty. Restored the browser viewport and left the actual results open at `http://127.0.0.1:4193/#/market-pulse`.
- PASS: warehouse integrity, all 19 existing UI tests, production build and four Sites packaging tests. The warehouse file and shared hosting files are unchanged.
- FIXED: two existing News bootstrap tests assumed August events stayed inside the last 168 hours forever. Their test clocks now cover both the original date (three events) and expiration (zero events). Application freshness logic and fixture dates were not changed.
- RELEASE GATE NOT CONSISTENTLY GREEN: one full `npm run check` passed; subsequent final-code runs intermittently fail existing 250 ms warehouse query timing assertions (`profile.meta.queryMs` in warehouse tests, `stats.meta.queryMs` in production-server tests). Latest full run stopped at the profile timing assertion; 18/19 warehouse tests passed. No timing limit was weakened. Repeated benchmark attempts have stopped at the bounded verifier gate; do not describe the latest full check as passing or use an earlier green run as release proof.
- WARNINGS: Vite still reports the existing >500 kB app chunk; Node reports experimental SQLite. No runtime error was observed in the prototype.
- LOCAL ONLY: no PR, push, merge, Vercel deployment, paid subscription or recurring job was launched. Main checkout's unfinished News Engine changes remain intact. Public research-feed distribution requires a separate rights/access decision and the release gate above must be resolved before shipping.

## Combined table revision — 2026-09-07

- Sleeper transactions and ESPN ownership now share one table. Removed the three summary KPI cards and provider tabs. Rows are 36px instead of 58px; the table has an 800px compact floor and contained scrolling on smaller screens.
- All 11 leaf columns support ascending/descending sorting, including watchlist and add/drop share. Sorting and watchlist survive reload. Export includes both provider timestamps, IDs and identity-match method.
- PASS: final `npm run check` exited 0, including warehouse, existing UI, 6 Market Pulse service tests, 10 combined-table UI tests, production build/server tests and Sites checks. Log: ignored `artifacts/market-pulse/combined-check.log`. This supersedes the earlier release-check result for this revision; historical timing failures remain documented above.
- PASS: browser refresh returned both real sources at 11:27 PM America/Chicago; one table displayed 1,017 matched/unmatched union rows. Browser confirmed roster-percentage sorting persisted after reload, all 11 columns fit with the icon sidebar, no clipped numeric cells, and narrow-screen overflow stayed inside the table. Restored the viewport override and left the icon sidebar selected to expose all metrics.
- Still local-only. No push, merge or public deployment performed.

## Known prototype limits

MFL and paid providers are not connected. Conservative identity matching can leave duplicate-looking rows when names or teams disagree; these are not silently guessed. No composite popularity score is presented. Private Yahoo league availability and team ownership remain unavailable without an authorized Yahoo connection. The first snapshot contains no historical trend; history grows only on successful uncached manual refreshes. ESPN's undocumented endpoint can stop working independently of this app. The local preview is accessible on this computer, not from another phone or platform.

## Hosted release — 2026-09-08

Robert requested continuing this prototype and deploying it to the existing Bowser Vercel app. This supersedes the original local-only launch boundary above. The release retains the combined table and connects the fixed Sleeper/ESPN endpoints through `/api/v1/market-pulse` on Vercel.

- Hosted functions use disposable in-memory SQLite caches. The browser stores up to 96 observations per provider/window in IndexedDB, merges observations by capture time, and computes ESPN changes against its own previous observation. History is specific to this browser, device and site origin; clearing site data removes it. This is not cross-device cloud storage.
- Each warm function caches successful refreshes for 15 minutes, coalesces concurrent requests and cools down failed attempts for one minute. The browser also respects successful snapshot cooldowns. Caches can reset when Vercel starts a new instance; no global cross-instance rate limit is claimed. No automatic refresh, paid provider, scheduler or new database was added.
- Hosted responses omit accumulated history, keeping payload size independent of retained history. The page retains newer data when the server starts empty, fails, or returns an older snapshot. Storage failures are visible and never prevent live refresh.
- Provider counts remain sample counts, ESPN remains experimental, and missing values remain unknown. No MFL, Yahoo league integration, social sentiment or invented heat score was introduced.
- Runtime references: [Vercel Node.js functions](https://vercel.com/docs/functions/runtimes/node-js), [browser IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API).
- Release proof: `npm run check`, independent code verifier and permanent-URL browser refresh/reload. Full check log is saved in ignored `artifacts/market-pulse/hosted-check.log`.

# Public fantasy news contract

`GET /api/v1/fantasy-news` is a read-only projection of the approved public repository snapshot, with the existing public intelligence read and verified archive as explicit fallbacks. It does not read Yahoo sessions, account responses, league rosters, private Pages or personalized decisions. It returns `Cache-Control: no-store`; other methods return 405 with `Allow: GET`.

The production, Vite and serverless routes use the same `fantasyNewsHandler` from `server/fantasy-news.mjs`. Vercel rewrites `/api/v1/fantasy-news` to the existing intelligence-feed function with `resource=fantasy-news`, preserving the hosting plan's twelve-function limit and the existing intelligence feed behavior. No authorization controls, provider credentials, stores, migrations or scheduled jobs are added by this route.

## Query

| Parameter | Values / default |
| --- | --- |
| `hours` | Integer 1–720; default 168 |
| `limit` | Integer 1–100; default 100 |
| `position` | Comma-separated QB, RB, WR, TE |
| `team` | Comma-separated team abbreviations |
| `status` | Existing intelligence reporting-status values |
| `impact` | CRITICAL, HIGH, MEDIUM, LOW |
| `eventType` | Existing intelligence event-type values, including RETURN |
| `search` | Case-insensitive public player/headline/summary/analysis text, bounded to 100 characters |

Invalid values return 400 before reading storage. `live` is rejected: polling a public read does not start ingestion. News dates are independent of NFL statistics season/week filters.

## Response

The response contains `meta` and `articles`. Articles have stable `id`, `headline`, `summary`, optional generic `fantasyAnalysis`, `category`, `categories`, `eventType`, `status`, `fantasyImpact`, `players`, `source`, `url`, `sources`, publication fields, evidence, freshness and injury fields. Categories are `injury`, `practice`, `playing_time` and `fantasy_news`. Player IDs remain null where identity has not been resolved; names are not substituted as IDs.

Each source retains `sourceName`, `author`, `xHandle`, `sourceType`, `publishedAt`, `url` and `isOriginalSource`, with `isX`, `access`, `accessLabel`, `timestampBasis` and `timestampStatus`. Access labels identify possible paywalls or X login/access limits; they do not promise access to the full linked content. Publication timestamps preserve their original timezone offset. Non-public URLs, embedded URL credentials, credential query parameters, private record markers and malformed citations are rejected. Additional record fields are omitted from the public projection.

`evidence.kind` is `official_report`, `report`, `rumor`, `speculation` or `market_signal`. Reporting status and source-authority confidence are separate from fantasy impact. Confidence is nullable and is not a calibrated injury probability. Sleeper adds/drops and FantasyCalc values are market observations; their label explicitly states that they do not confirm football news, and their `timestampBasis` is `observed_at`.

Publication time, event update time, original-source verification time and API read time remain separate:

- `publishedAt`: latest accepted source publication/observation time, or null for an archive with unspecified source timezone.
- `publishedAtRaw` and `publishedDate`: original archive clock text and calendar date without an invented UTC instant.
- `firstReportedAt` / `updatedAt`: stored event times, never used to refresh source freshness.
- `checkedAt`: original-source verification time for a separately verified archive, otherwise null.
- `capturedAt`: null; the existing read contract does not provide article receipt time.
- `meta.readAt`: this API read, never a source publication or verification time.

The default persisted read is bounded to 100 events across 720 hours; the projection then applies the requested source-time window and filters and sorts newest first. An upstream total larger than the loaded rows produces partial-coverage metadata. Duplicate IDs are collapsed, unsupported positions are excluded, and malformed/future/missing publication timestamps in durable records are rejected. A partly invalid citation set rejects the whole record rather than presenting a cleaner-looking subset.

## State, freshness and coverage

`meta.state` is `unavailable`, `empty`, `current`, `stale` or `partial`. For database snapshots, `current` describes recent accepted publication/observation times. For repository snapshots, it describes a recent original-source check, explicitly labeled by `meta.freshness.basis: source_check`; it does not establish recent publication. It never promises complete coverage. Missing verified repository, database and archive data is unavailable. A known database read failure produces an unavailable response without substituting the archive or exposing provider error bodies.

`meta.freshness` provides a six-hour threshold, `latestSourcePublishedAt`, `latestEventUpdatedAt` and nullable `ageSeconds` for publication/observation age. Repository source-check freshness adds `sourceCheckedAt` and `sourceCheckAgeSeconds`. Neither is the API read or event-edit time. Every article carries its own publication freshness state; an unspecified publication timezone remains unknown even if its original source was checked recently. `meta.live` is always false: this endpoint is a snapshot read.

`meta.coverage` includes QB/RB/WR/TE counts, loaded/valid/undated counts, `complete: false` and explicit limits. X search is bounded discovery rather than a complete post stream. Enabled adapters are not proof of all-player, all-team or all-source coverage. `meta.sources` reports configured adapter capability separately from verified coverage; market adapters are identified with `news: false`.

The existing ingestion adapters normalize some absent/invalid upstream clocks to their current time before persisting. This projection can reject malformed stored clocks, but cannot recover or identify an already-normalized replacement clock. Independently verified source-time provenance is therefore not established by this new read route. The archived baseline preserves unavailable timezone information explicitly.

## Verified public archive

`data/fantasy-news-baseline.json` is accepted only with `version: 1`, `scope: public_nfl_news`, `mode: archived_public_baseline` and an events array. It contains separately verified original public reporting, not private Page decision text or production fixtures. It is used only when the repository has no verified last-good snapshot and the existing read returns no durable active snapshot; a database read failure never substitutes the archive for the failed read.

An archive is always labeled `snapshotMode: archived_public_baseline`, `state: stale` and `live: false`, even if a release or API read just occurred. Original-source verification does not renew the report's age. Each archived record requires a valid `checkedAt`; a missing timezone requires raw source clock text and a valid `publishedDate`.

For an unknown source publication clock/timezone, its possible calendar-day interval across UTC+14 through UTC-12 is included when it overlaps the selected window. This retains same-day and possibly relevant boundary reports while explicitly stating that a row may fall outside the exact requested hours. Future calendar dates are rejected against the current UTC date. `meta.timeFilterBasis` states `exact_timestamps_and_overlapping_calendar_dates`, and coverage limits explain that exact-hour inclusion and publication age cannot be established. Known ISO timestamps retain exact-hour filtering. Sorting an undated clock by its calendar date does not create a publication instant; `publishedAt` and source age remain null.

## Public repository persistence

The sanctioned read URL is fixed in `server/fantasy-news-repository.mjs`:

`https://raw.githubusercontent.com/RBarbieri13/Bowser/fantasy-news-data/data/fantasy-news-public.json`

The envelope is `{version:1, scope:"public_nfl_news", mode:"repository_public_snapshot", checkedAt, updatedAt, revision, contentHash, events}`. `checkedAt` records actual original-source verification, `updatedAt` records the writer's publication time, and `revision` is a bounded unique writer revision. Writer time and API receipt do not renew source verification. Publication times remain per source, with null/raw/date fields retained where a source timezone is unavailable.

`repositorySnapshotHash(snapshot)` computes SHA256 of canonical JSON with every object key recursively sorted, array order preserved, and only the top-level `contentHash` excluded. Writers must use this exact canonicalization, validate with `validateRepositorySnapshot`, and publish the final complete envelope. The checksum detects corruption and mismatched data; it is not a cryptographic identity signature or proof that prose is public. A trusted source-native writer and source readback remain required to exclude personalized text in otherwise valid string fields.

The reader rejects unknown/private fields, invalid clocks, unsupported player positions, credential/private URLs, missing/empty/over-20 citation sets, malformed JSON, mismatched checksums, more than 500 events, responses larger than 512 KiB, redirects, and regressing/conflicting revisions. Per-record source checks cannot follow the envelope source check; the source check cannot follow the writer time. The HTTP request uses a five-second abort and a sixty-second ETag cache. Concurrent reads share one fetch.

Only one verified snapshot is retained in bounded disposable server memory. Git is persistence. Failed reads retain that last-good snapshot with `meta.repository.lastReadState: unavailable` and a stale overall state. A cold-start 404 never claims verification and falls back explicitly. `meta.repository` carries the source URL, revision, checksum, source-check time, writer time, receipt time, cache state and sanitized failure code. The route has no external write credential and cannot publish to GitHub.

Scheduled public writes use the existing authorized GitHub connector against the dedicated data branch/file, with current-file SHA checks and full-envelope validation/readback. This route adds no raw API write endpoint, secrets, OAuth changes or durable database. Browser polling remains GET-only. Scheduler status must be verified separately; no public poll implies a scheduled task ran.

### Local preparation and material changes

`scripts/prepare-fantasy-news-snapshot.mjs` consumes a public events array and an optional existing validated snapshot. It has no network or remote-write code:

```text
node scripts/prepare-fantasy-news-snapshot.mjs \
  --events public-events.json \
  --previous previous-snapshot.json \
  --checked-at <actual-source-check-ISO> \
  --updated-at <writer-publication-ISO> \
  --revision <unique-writer-revision> \
  --out prepared-snapshot.json
```

Omit `--previous` only for an explicitly authorized first creation. All flags also accept `--name=value`. Without `--out`, changed content is returned as a `snapshot` inside the JSON result; with `--out`, only a changed, validated envelope is atomically written to that local file. An unchanged run leaves any prior output bytes untouched and returns `changed: false, reason: unchanged_public_content`. Check that result before using an output file from a prior run.

Original stable event IDs are required and preserved; duplicate IDs stop preparation for source reconciliation. Events are sorted by stable ID. The caller must supply actual per-record source checks; the tool does not stamp every retained report with the envelope check time. Where `publishedAt` and the original clock text are unavailable but a valid source-supplied `publishedDate` exists, it records `YYYY-MM-DD (publication clock and timezone unavailable)` and retains `publishedAt: null`. A missing publication date is an error; the tool never derives it from verification, writer or poll time.

Both the previous and proposed snapshots are validated before deciding whether to emit output. Material comparison canonicalizes events by ID and excludes only verification timestamps (`checkedAt` at the envelope, event and citation levels) and the writer-only envelope metadata (`updatedAt`, `revision`, `contentHash`). Original publication fields, event first-report/update times, source order and URLs, identities, evidence, injury/role details and report text remain material. A clock-only source recheck does not create a commit or renew the persisted public check time. The separate scheduled-run status remains the place to verify that a later check executed.

Changed content requires a new revision, a later writer time and a non-regressing source-check time. The output is capped at 512 KiB to match the public reader. Invalid input, private markers, malformed clocks, missing source dates or duplicate IDs produce an error before writing the local output. No secret or private response body appears in error summaries.

### Optimistic connector publication

1. Use the existing GitHub connection to fetch `https://api.github.com/repos/RBarbieri13/Bowser/contents/data/fantasy-news-public.json?ref=fantasy-news-data`. Record the content blob `sha`, decode the returned public UTF-8 payload and validate it as the previous snapshot. Confirm the exact approved branch and path; do not fall back to `main`, create an unrelated file, or overwrite an unknown existing artifact.
2. Recheck the original public sources for the proposed additions/changes and assemble only public NFL event fields. Keep personal league decisions and private Page prose out of the input. Preserve existing source checks for retained records and retain last-good reporting when a source request fails. Resolve duplicate event IDs against the original source before calling the CLI.
3. Prepare the candidate locally with the previous snapshot and actual check/writer times. If `changed` is false, stop without a remote write. If true, use the complete prepared UTF-8 envelope and confirm its revision/checksum/count from the CLI result.
4. Fetch the same repository contents URL again immediately before writing. If its blob SHA differs, reread, validate and prepare against that newer snapshot; do not publish a stale full-file replacement. Use `GitHub update_file` with `repository_full_name: RBarbieri13/Bowser`, `branch: fantasy-news-data`, `path: data/fantasy-news-public.json`, the current `sha`, the exact prepared content and a concise material-change commit message. The connector performs the authorized write; no raw REST write or manually handled API token is used. Never run writes for this path in parallel.
5. Read back the exact file and branch after the connector confirms the write. Verify the returned content blob SHA, complete payload, revision and checksum with `validateRepositorySnapshot`. Also read the sanctioned raw source URL and the deployed public GET route after their bounded caches expire. A connector commit result alone does not establish reader/UI completion. Keep failed validations or readbacks explicit and retain last-good data.

`vercel.json` sets only `git.deploymentEnabled["fantasy-news-data"] = false`; public data commits do not trigger app deployments. No wildcard or app branch is disabled, so `main`, feature branches and the default deployment behavior remain enabled. The config test checks that exact boundary. Public data publication stays separate from the app's branch/PR/release workflow.

## Existing protected database ingestion

The existing adapter-driven database ingestion path remains `POST /api/v1/intelligence-runs` with its operator Bearer authorization and a unique `Idempotency-Key`. Its body selects `source`, `lookbackHours` (1–168), `positions`, `teams` and `query`; it scans configured adapters and promotes a validated snapshot through the existing durable intelligence store. This endpoint does not accept a source-native `events` payload. A new upload/write route is outside this change.

The existing refresh implementation requires `INTELLIGENCE_REFRESH_TOKEN` and `DATABASE_URL`; it does not silently use process memory as durable storage. Existing idempotency, concurrency, provider-coverage regression and last-good snapshot protections remain unchanged. No secret may be placed in the public browser, public Page, URL query, repository or response. The public UI polls only the GET route, at the advertised 60-second interval.

`meta.refresh.ready` reports only the existing token-protected database configuration capability; `persistence` distinguishes `public_git_repository`, `static_public_archive` and `existing_intelligence_database`. `schedulerVerified` remains false and last-run timestamps remain null because the public feed contract does not establish scheduled execution. Do not describe polling as unattended ingestion. At implementation time the selected environment and independently inspected production environment had no configured durable database or refresh token; the legacy database ingestion path remains unavailable. The public repository alternative uses the separately approved existing GitHub connection. This change provisions nothing.

Validation: `node --test tests/fantasy-news-api.test.mjs tests/fantasy-news-repository.test.mjs tests/fantasy-news-snapshot.test.mjs` covers stale/unavailable states, publication/check/writer clocks, malformed/future/calendar-invalid dates, evidence/access limits, private field/URL rejection, filters, protected-ingestion separation, bounded reads, archive clocks, repository hash/size/redirect/ETag/regression/outage handling, GET-only/no-store behavior, material-change preparation, CLI local writes and the data-only deployment setting.

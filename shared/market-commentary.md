# Market Pulse commentary — September 26, 2026

Market Pulse adds news topics and player-specific text sentiment to the existing combined Sleeper/ESPN table. Open Filters & settings for the 24/72/168-hour news window, topic, tone, and With news filter. Click any new header to sort, drag its separator to resize, or click a news count to inspect linked source headlines and exact model probabilities. CSV includes the new columns and commentary capture timestamp.

## Sources and meaning

- Input: the latest 50 articles from [ESPN's public NFL news feed](https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=50). This is an experimental endpoint, not a guaranteed public API contract. Only public headlines/descriptions are analyzed; no paywalled article body is fetched.
- Attribution: an explicit NFL athlete ID AND a complete player name in the supplied excerpt are required. UI joins only the exact ESPN player ID already resolved in Market Pulse. Tagged athletes absent from the excerpt are excluded. Players outside the returned ownership population may have captured evidence but no table row.
- Model: pinned `typesafe/jev-1.13`, through [OpenRouter's Decisions API](https://openrouter.ai/docs/guides/community/jev). Responses retain the resolved model version, raw probabilities, source URL/date, analysis date, policy version, and SHA-256 of the analyzed excerpt. Public snapshots retain at most 25 headline words per article, not full descriptions.
- These are model judgments about expressed fantasy outlook, not forecasts, source verification, injury confirmation, expert consensus, or social sentiment. ESPN is one publication. No Reddit, X or Yahoo-private content is included.
- News = unique article/player pairs. Topic = newest matching article's topic. Topic confidence below 70% becomes Uncertain. Positive/neutral/negative labels require both relevance and sentiment confidence of at least 70%; all other items are Unclear. Thresholds are uncalibrated research defaults, not guaranteed accuracy.
- Confidence = mean model sentiment confidence over accepted items; source credibility is not measured. Tone = `100 × (positive − negative) / accepted items`. Neutral items count in the denominator. This never combines ownership and transaction populations into a score.
- Δ Tone compares two adjacent equal windows, and requires at least two accepted items per window. The first capture has insufficient prior-window evidence for most players; missing change stays blank. Topic filtering applies equally to both windows. Tone filtering selects players with at least one item of that tone; counts still describe all selected-topic items.
- Windows end at the current browser time, refreshed once a minute. Capture timestamps stay visible even with collapsed controls. A dash means no sampled evidence or insufficient history, never a claim that no news exists.

## Refresh and release

Run `npm run market:commentary:refresh` in the active verified Bowser checkout with the ignored `.env.local` OpenRouter key. It fetches the fixed ESPN endpoint, reuses unchanged decisions, and preserves older records. It is a CLI, not a publicly callable paid inference proxy. Market Pulse's Refresh data button refreshes transaction/ownership observations only, as explained in its source notes. No new background schedule was created.

Maximum 60 sequential decisions per invocation; 2,400-character excerpts; 20-second request timeout; no automatic retries. Stop if reported cumulative cost reaches $0.05. A response can cross that amount before its cost is known, so this is a post-response circuit breaker, not an account-level billing cap. Missing/invalid cost, provider error, empty/malformed source, concurrent run, or excess candidate count prevents publication. A lock prevents concurrent CLI refreshes. After a crash, inspect for a running process before removing the ignored lock under artifacts.

Changed successful captures write a new immutable file in `data/market-commentary-archive/`, then atomically replace `data/market-commentary.json`. Unchanged results do not write. Errors retain the last-good public snapshot; completed provider calls may still have been billed. Archives retain earlier classifications of edited articles; only the newest version of an article/player pair counts in the current snapshot. Historical records are never represented as earlier captures than their actual capture date.

The current snapshot is bundled by Vite, so publishing new commentary requires tests, a build, and a verified release. Archives are not bundled into the browser. No OpenRouter credentials or full source descriptions belong in Git or browser assets. No Vercel secret changes are needed for this snapshot-based feature.

## Initial live capture and verification

September 26, 2026 at 21:36:07 UTC: 48 article/player decisions, 37 unique ESPN articles, 39 tagged players. Reported total cost: $0.001682184. Source publication times run from September 25 at 14:10:52 UTC through September 26 at 21:33:09 UTC. The live Market Pulse population matched 26 players at verification time; that count can change as providers change their returned populations.

Regression coverage includes conservative IDs and excerpt matching, invalid/future timestamps, link protocol validation, duplicate/revised articles, incremental reuse, cost/call limits, model failure retention, missing vs neutral vs uncertain, adjacent-window math and sample thresholds, all new header sorts/resizers, filters, source evidence and CSV capture attribution. Full app checks and release evidence are recorded separately under shared/operations.

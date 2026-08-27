# Bowser Fantasy Intelligence Engine — research and implementation brief

**Date:** 2026-08-26  
**Scope:** Cross-league NFL player-news intelligence for Bowser  
**Status:** First Bowser-native implementation completed locally; live xAI scans require `XAI_API_KEY`.

## Outcome

Bowser now has a standalone intelligence boundary inside the existing application: a canonical event contract, deterministic normalization and consolidation, a cited xAI X Search + Web Search provider, a queryable read-only API, a source registry, and a user-facing Fantasy Intelligence workbench. It does not copy code from unlicensed repositories and does not scrape surfaces that disallow automated access.

## Product purpose

The service answers one question: **what changed for a fantasy-relevant NFL player, how certain is the underlying fact, and what might it mean for fantasy value?** It keeps three concepts separate:

1. **Factual confidence** — authority and independent corroboration of the underlying report.
2. **Fantasy sentiment** — directional fantasy-value interpretation from -100 to +100.
3. **Buzz** — velocity of discussion, independent of truth or value direction.

This avoids a common failure mode in social-news products: treating a loud rumor as a highly credible positive development.

## Source audit

| Requested source | Current status | Bowser use | Reason |
|---|---|---|---|
| xAI X Search | Primary provider, key required | Live X discovery with cited posts and threads | Official API supports date- and account-scoped search. |
| xAI Web Search | Primary provider, key required | Official/beat/news discovery and corroboration | Official API returns web results and citations. |
| The Week in Fantasy leaderboards (5 views) | Reference only | Manual or future licensed API/export comparison | `/leaderboard/` is disallowed for automated crawling. |
| `gtonic/nfl_mcp` | Architecture reference | Provider separation, caching, health, evaluation concepts | MIT license verified; Bowser retains its own contracts. |
| `cbratkovics/fantasy-football-ai` | Architecture reference | Feature provenance, model/evaluation boundaries | MIT license verified; forecasting is outside this slice. |
| `JayMishra-source/Fantasy-Football-AI-CoManager` | Concept only | Provider abstraction and missing-credential degradation | No repository license file verified. |
| `stevekrenzel/pick-ems` | Concept only | Narrow analyst prompt ideas | No repository license file verified. |
| `AggieSportsAnalytics/FantasyChatbot` | Concept only | Time-aware RAG concept | No repository license file verified; data/model stack is dated. |
| `wiggapony0925/GoalMine` | Concept only | Parallel source roles and deterministic scoring concepts | Proprietary/no reusable license verified; soccer domain. |
| `gungorefecetin/ai-news-summarizer-sentiment-analysis` | Concept only | Fetch → summarize → sentiment boundary | README license claim was not backed by a verified LICENSE file. |
| `bendominguez0111/fantasy-football-twitter-analysis` | Historical concept only | Analyst-account and aggregate sentiment concept | No repository license; old Twitter/VADER implementation. |

## Pipeline

```text
xAI X Search + Web Search
        │ cited structured JSON
        ▼
provider boundary
        │ timeout, key status, raw model confidence retained
        ▼
deterministic normalizer
        │ enums, safe URLs, timestamps, no unknown-position guessing
        ▼
source scoring + consolidation
        │ status caps + authority + independent corroboration
        ▼
canonical event snapshot
        │ read-only API filters and source registry
        ▼
Bowser Fantasy Intelligence page
```

## Canonical event

Every event includes player/team/position, headline, summary, event type, verification status, fantasy impact, fantasy analysis, affected players, injury detail, separate sentiment and buzz objects, deterministic source quality, cited source objects, and first/last report timestamps.

Supported verification states: `CONFIRMED`, `REPORTED`, `STRONG_INDICATION`, `RUMOR`, `SPECULATION`.

Supported impact states: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`.

Supported fantasy positions: `QB`, `RB`, `WR`, `TE`. Invalid or absent positions are rejected rather than guessed.

## Confidence logic

Confidence is recalculated in Bowser and capped by verification state. Official/team/NFL sources receive the strongest base authority; named national reporters and beat reporters follow; fantasy outlets and general media follow; anonymous social discussion is lowest. Independent source count and source-type diversity can increase confidence modestly. Model-provided confidence is preserved separately as `modelConfidence` and cannot override Bowser's deterministic score.

## UI behavior

The new `#/intelligence` workbench provides:

- freshness, position, impact, and text filters;
- player/team marks, status, event type, impact, and source-confidence badges;
- a fantasy-read block distinct from the factual summary;
- a -100 to +100 fantasy-sentiment rail;
- direct source links;
- transparent provider state and disabled live-scan control when no key is configured;
- a source registry showing license, automation status, adoption role, and provenance notes.

## Operational model

The checked-in snapshot is a transparent bootstrap and offline fallback. `npm run intelligence:refresh` performs one cited xAI scan and atomically replaces the snapshot. No recurring job has been activated. A future scheduler can call the refresh entry point every 5–15 minutes during high-value NFL reporting windows and less frequently outside them, with cost and rate limits chosen before activation.

## Security and privacy

- No provider credential is stored in Git.
- The public API is read-only.
- Live scans fail closed when `XAI_API_KEY` is absent.
- Source URLs are restricted to HTTP(S).
- The provider has a hard timeout.
- Social popularity cannot promote factual confidence.
- The UI labels snapshot mode honestly rather than representing it as live.

## Remaining production inputs

1. Add `XAI_API_KEY` to the local/Vercel environment.
2. Decide the recurring refresh cadence and maximum per-run cost before enabling a scheduler.
3. If The Week in Fantasy offers a licensed API or export, add it behind a separate adapter; do not scrape its leaderboard routes.

## Key implementation files

- `server/intelligence-schema.mjs`
- `server/intelligence-prompt.mjs`
- `server/intelligence-provider-xai.mjs`
- `server/intelligence-store.mjs`
- `api/v1/intelligence-feed.mjs`
- `api/v1/intelligence-sources.mjs`
- `scripts/refresh_intelligence.mjs`
- `src/IntelligenceFeed.jsx`
- `data/intelligence-feed.json`
- `data/intelligence-sources.json`

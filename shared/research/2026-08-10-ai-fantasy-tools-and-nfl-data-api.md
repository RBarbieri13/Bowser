# AI fantasy-football tools and NFL data API options

**Prepared:** 2026-08-10

**Scope:** Cross-league research; no league-specific scoring assumptions.
**Transcript source:** Attached chat transcript supplied by Robert. Product descriptions in the first two tables summarize what that transcript said; they are not all independent product endorsements.

## Every fantasy product recommended or mentioned in the transcript

The two transcript answers contained **19 distinct fantasy-football products**. Repeated products are consolidated into one row, while every named sub-tool and feature remains listed.

| Product / website | How the transcript positioned it | Named tools and capabilities mentioned | Main limitation stated in the transcript |
|---|---|---|---|
| [twif / The Week in Fantasy](https://www.theweekinfantasy.com/) | New-wave #1; best overall research and trend discovery; mature-list #8 | twif 2.0, Vibe Index, Jump to Source, emerging-player trends, source-linked podcast clips, comparisons, virtual GM, personalized draft plans, live snake/auction help | Newer and less proven; sentiment and buzz are not predictive models |
| [RotoBot AI](https://rotobot.ai/) | New-wave #2; mature-list #7; best conversational statistics and open-ended fantasy chat | 2026 Fantasy Pass, Stat Explorer, AI insights feed, customized rankings, trade analysis, mock-draft Q&A, comparisons, Draft Helper; play-by-play, box scores, injuries, news and odds | Betting roots; league-management features still maturing |
| [STACKED Fantasy](https://www.stackedfantasy.com/) | New-wave #3; mature-list #9; best ADP intelligence and AI integration | Live War Room, projections, VORP, availability odds, auction values/bidding, ADP movement and platform gaps, leaguemate draft tendencies, podcast/video/article extraction, [read-only MCP](https://www.stackedfantasy.com/mcp), FantasyPros ECR and platform ADP access | More technical and complex; mobile product was still rolling out |
| [NFL Pro Fantasy AI Assistant](https://www.nfl.com/news/nfl-pro-launches-fantasy-ai-assistant-powered-by-aws) | New-wave #4; mature-list #11; best official NFL/Next Gen Stats context | Multi-agent assistant using AWS/Amazon Bedrock, Next Gen Stats, NFL Fantasy data, current news and matchup data for start/sit, waivers, injury impact and rest-of-season questions | NFL ecosystem focus; requires NFL+ Premium; not a universal league manager |
| [Fantasy Points](https://www.fantasypoints.com/) | New-wave #5; mature-list #2; best serious research platform | Ball Knowledge AI; Data Suite; articles, podcasts, rankings, projections and datasets; route participation, targets, coverage, separation, usage and situational splits | Full data and unlimited AI can be expensive; limited league sync |
| [ESPN Fantasy Insights with IBM watsonx](https://www.espn.com/fantasy/football/) | New-wave #6; best free, low-effort AI inside a league host | Weekly insight cards; Buy Low/Sell High, Diamond in the Rough, Trade Bait, boom/bust, media sentiment, stable-floor and injury-risk categories | Recommendation feed rather than open-ended research chat |
| [LeagueLogs](https://leaguelogs.com/) | New-wave #7; best league-aware AI with memory | Scout analyst, Market Index, rankings, risers/fallers, waiver heat, Trade Finder, Trade Analyzer, post-draft analysis, league-history memory | Better for league context and trades than deep raw game-log analysis |
| [Scoutcast.ai](https://scoutcast.ai/fantasy/) | New-wave #8; mature-list #14; best hands-free option | Fantasy Season Pass, Scoutcast Plus, four weekly roster/opponent-aware audio briefings, interruptible spoken follow-ups | Audio-first rather than a dense statistics workstation; supplemental rather than primary decision source |
| [gamedai](https://gamedai.app/) | New-wave #9; most experimental option | Scout conversational agent, Blitz live audio, football knowledge graph, rankings, trade analysis, start/sit; cited nflfastR, Big Data Bowl and PFF feeds | Brand-new and unproven; platform support unclear |
| [FantasyPros](https://www.fantasypros.com/nfl/) | Mature-list #1; best all-around command center | Coach AI, Expert Consensus Rankings/ECR, projections, Draft Wizard, league sync, realistic mocks, Draft Intel, start/sit, waiver, trade and multi-league tools | Consensus can conceal analyst disagreement; Coach AI is paid |
| [PFF Fantasy](https://www.pff.com/fantasy) | Mature-list #3; best advanced football data | PFF grades, aDOT, fantasy points per opportunity, rushing/receiving metrics, rankings, projections, league sync, Live Draft Assistant, PFF+ | Better for independent analysis than automated weekly management; paid subscription |
| [Draft Sharks](https://www.draftsharks.com/) | Mature-list #4; best live-draft assistant and recommended draft-night tool | Draft War Room; dynamic values based on 17 factors; trade-partner discovery and weekly recommendations | Less conversational; advice reflects its own projections |
| [RotoWire](https://www.rotowire.com/football/) | Mature-list #5; best news, player pages and game-log research | Player profiles, game logs, news, depth charts, projections, auction values, historical stats, Live Draft Assistant and AI mock opponents | Broad interface can feel cluttered; many features paid |
| [RotoViz](https://www.rotoviz.com/) | Mature-list #6; best analytical trends and range-of-outcomes work | NFL Stat Explorer, Weekly Stat Explorer, Game Splits, Screener, pace tools, similarity search, GLSP projections, Zero-RB and best-ball research | Steep learning curve; no conversational league manager |
| [Fantasy Life Fantasy HQ](https://www.fantasylife.com/tools) | Mature-list #10; best largely free league-management hub | League sync, custom rankings, projections, lineups, waivers, trades, utilization, air yards, snap counts, fantasy finishes and AI-style mock opponents | Primarily conventional projections/algorithms rather than generative AI |
| [PlayerProfiler](https://www.playerprofiler.com/) | Mature-list #12; best player-profile and dynasty research | Athletic testing, prospect profiles, comparable players, snap share, route participation, target share, efficiency, Value Over Stream, dynasty rankings and trade tools | Excellent player pages but not a complete league manager |
| [Stathead Football](https://stathead.com/football/) | Mature-list #13; best custom historical game-log queries | Searches for games, seasons, splits, streaks, spans, opponents, plays and records | Not fantasy-specific or an AI recommendation engine |
| [WalterPicks](https://www.walterpicks.com/) | Mentioned as useful but excluded from the “new in one year” list | Existing AI-driven projections and fantasy tools | Core AI product predates the transcript's strict one-year window |
| [Fantasy Alarm / FantasyFootball.ai](https://www.fantasyalarm.com/) | Mentioned as useful but just outside the “new in one year” cutoff | FantasyFootball.ai | July 2025 launch fell outside the August 2025 cutoff |

## Other named platforms, technologies and data sources in the transcript

These were referenced as integrations, infrastructure or source data—not presented as additional standalone fantasy-tool recommendations.

| Name | Why it appeared |
|---|---|
| [ESPN Fantasy](https://www.espn.com/fantasy/football/), [Yahoo Fantasy](https://football.fantasysports.yahoo.com/), [Sleeper](https://sleeper.com/fantasy-football), [MyFantasyLeague](https://www.myfantasyleague.com/), [NFL Fantasy](https://fantasy.nfl.com/) and [CBS Fantasy](https://www.cbssports.com/fantasy/football/) | League hosts supported by various sync/draft tools |
| [Amazon Bedrock](https://aws.amazon.com/bedrock/) / AWS Bedrock | Agent infrastructure behind NFL Pro Fantasy AI Assistant |
| [NFL Next Gen Stats](https://nextgenstats.nfl.com/) | Official advanced-data input to the NFL assistant |
| [NFL+ Premium](https://www.nfl.com/plus/) | Subscription gate for the NFL assistant |
| [IBM watsonx](https://www.ibm.com/watsonx) | AI platform behind ESPN Fantasy Insights |
| [nflfastR / nflverse](https://github.com/nflverse) | Play-by-play/statistical source cited by gamedai |
| [NFL Big Data Bowl](https://operations.nfl.com/gameday/analytics/big-data-bowl/) | Tracking-data source cited by gamedai |
| PFF feeds | Data source cited by gamedai; PFF is also a recommended consumer platform above |
| [ChatGPT](https://chatgpt.com/), [Claude](https://claude.ai/) and Codex | General-purpose assistants that STACKED says its MCP can supply with read-only league context |
| Model Context Protocol (MCP) | Connection method named for STACKED's read-only league-data integration |
| FantasyPros ECR and platform ADPs | Ranking/market inputs available through STACKED's connection |
| PFF+ and Scoutcast Plus | Paid subscription tiers mentioned for PFF and Scoutcast |

## Best single-source NFL statistics connection for Codex

### Recommendation: SportsDataIO NFL API

[SportsDataIO](https://sportsdata.io/nfl-api) is the closest exact fit to the requested “one statistical source” because one NFL data model covers:

- player and team game/season stats, schedules, rosters, injuries, depth charts, play-by-play, projections and fantasy points;
- offensive, defensive and special-teams player snaps plus team snap totals, available from 2012 onward;
- DraftKings, FanDuel and Yahoo DFS slates, player salaries and scoring; and
- stable player IDs that let Codex join stats, snaps, projections and DFS pricing without reconciling separate vendors.

Important timing and cost facts:

- The production **Leagues API** supplies real-time in-game data, but access and pricing require a sales agreement.
- The self-serve **Discovery Lab Fantasy** tier currently lists at **$99/month or $599/year**, contains real data, and is delayed until the next day. Its free tier is last-season data.
- Even on the live product, official snap counts are not live during games; SportsDataIO publishes them the morning after each game.
- DraftKings salaries/slates are normally posted ahead of contests; the workflow guide says the main Sunday slate is available at least 48 hours before kickoff.

### Alternatives and why they rank lower for this exact requirement

| Data source | Codex connection | Player stats | Snap counts | DraftKings salaries | Live/current | Verdict |
|---|---|---:|---:|---:|---:|---|
| [SportsDataIO NFL API](https://sportsdata.io/developers/api-documentation/nfl) | Straightforward REST/JSON wrapper using an API-key header | Yes | Yes; next morning | Yes; salaries and slates | Yes on commercial Leagues API; next-day on self-serve tier | **Best exact one-source fit** |
| [Sportradar NFL API](https://developer.sportradar.com/football/reference/nfl-overview) | Official [Codex-compatible MCP server](https://developer.sportradar.com/getting-started/docs/mcp-server) plus REST/JSON | Yes; deep and real-time | Player participation is documented, but a fantasy-ready snap-count feed was not clearly confirmed | Not confirmed in the NFL API | Yes; live REST and push feeds | Easiest native Codex/MCP story, but it does not clearly satisfy the complete stats + snaps + DK requirement |
| [nflverse](https://github.com/nflverse) | Direct Parquet/CSV or Python via `nflreadpy` | Yes; weekly stats and rich play-by-play | Yes via snap-count dataset | No | Updated automatically, but not a commercial real-time feed | Best free research/backtesting source; not the requested live single source |

## Practical Codex architecture

Use two read-only connections with different jobs:

1. **SportsDataIO** supplies NFL truth: current/final stats, usage, snaps, projections and DFS pricing.
2. **STACKED MCP** optionally supplies private league context: scoring, rosters, standings, opponents, waiver pool, trades, ECR and platform ADP.

For the SportsDataIO side, the safest local implementation is a small read-only wrapper that:

- reads `SPORTSDATAIO_API_KEY` from the environment or macOS Keychain rather than storing it in the repository;
- exposes narrow commands/tools such as `player_week`, `weekly_stats`, `snap_counts`, `injuries`, `projections` and `dfs_slate`;
- caches responses locally with retrieval timestamps and preserves the raw JSON behind recommendations; and
- labels each result as live, final or next-day, so Codex never treats provisional stats or unavailable snap counts as final.

No connector was installed in this pass because a provider/tier and API key have not yet been selected.

## Primary verification sources

- [SportsDataIO NFL data dictionary](https://sportsdata.io/developers/data-dictionary/nfl) — stat, snap-count and DraftKings salary fields.
- [SportsDataIO NFL workflow guide](https://sportsdata.io/developers/workflow-guide/nfl) — snap timing and DFS slate/salary availability.
- [SportsDataIO access and pricing](https://sportsdata.io/developers) — trial, Discovery Lab and live Leagues API distinctions.
- [Sportradar NFL overview](https://developer.sportradar.com/football/reference/nfl-overview) and [MCP setup](https://developer.sportradar.com/getting-started/docs/mcp-server).
- [nflverse repositories](https://github.com/nflverse) and [`nflreadr` data dictionaries](https://github.com/nflverse/nflreadr/blob/main/R/data.R).

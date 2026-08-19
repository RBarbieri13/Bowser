# League Hub product and Yahoo data contract

Last verified: 2026-08-19

## Product purpose

League Hub is Bowser's multi-league control dashboard. It should let Robert move from “What requires attention across all four teams?” to the correct league-specific action without mixing scoring, roster, waiver, or playoff rules between leagues.

The first release intentionally ships an honest unconnected state. It defines the four league slots and the dashboard modules without inventing rosters, matchups, standings, projections, or transactions.

## Dashboard modules

| Module | Live Yahoo inputs | Bowser/local inputs | Intended decisions |
|---|---|---|---|
| Weekly command queue | Rosters, team matchups, transactions | NFL schedule, injuries, player projections | Which lineup, waiver, trade, or injury decisions need attention first? |
| Matchup board | Weekly matchups, team points | Player projections and game context | Which leagues are closest and where can a lineup change matter most? |
| Team health matrix | Current roster and starting lineup | Injury status, bye weeks, depth charts | Which teams have empty slots, injured starters, bye conflicts, or weak depth? |
| Waiver radar | League player ownership and waiver settings | Opportunity trends and projections | Which player is available in which league, and what is an appropriate claim or FAAB bid? |
| Trade center | League teams, rosters, and pending trades | Rest-of-season value and roster construction | Which teams are realistic partners and whether an offer improves both sides? |
| Player exposure | All four rosters | NFL schedule, injuries, projections | Where are outcomes, bye weeks, and injury risk concentrated across teams? |
| Standings snapshot | Standings, points, waiver priority, FAAB | Schedule difficulty and projections | Which teams need short-term wins versus long-term roster value? |

## Information required from Robert

1. The fourth league's name.
2. Robert's fantasy team name in each league.
3. Each Yahoo league key, formatted like `<game_id>.l.<league_id>`.
4. Each league's team count, scoring rules, roster slots, waiver method, FAAB budget, playoff format, keeper rules, and draft format.
5. Yahoo Fantasy API application approval and OAuth credentials. The Client ID and Client Secret must be placed directly into Vercel environment variables; they must not be pasted into source files, committed to Git, or stored in browser local storage.

## Yahoo connection architecture

- Use Yahoo OAuth 2.0 Authorization Code flow from a server-side endpoint.
- Store encrypted refresh tokens on the server only.
- Discover the signed-in user's teams first, then reconcile the four supplied league keys.
- Cache normalized league, team, roster, matchup, standing, transaction, and ownership snapshots locally so dashboard reads stay fast.
- Keep every record keyed by Yahoo league key to prevent cross-league rule or roster leakage.
- Treat Yahoo access as read-only unless Robert later requests and Yahoo approves write access.
- Include Yahoo's required linked attribution wherever Yahoo data is displayed.

## Official sources

- <https://sports.yahoo.com/developer/access/>
- <https://sports.yahoo.com/developer/docs/>
- <https://developer.yahoo.com/oauth2/guide/>
- <https://football.fantasysports.yahoo.com/>

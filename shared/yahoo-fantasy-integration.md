# Yahoo Fantasy integration plan

Last verified: 2026-08-16

## What Bowser can obtain through the supported Yahoo Fantasy Sports API

| Bowser field | Supported source | Implementation |
|---|---|---|
| League ownership status | `league/{league_key}/players;player_keys=.../ownership` | Store `owned`, `waivers`, or `free agent` per league and player. |
| Owning fantasy team | Player ownership subresource and team roster resources | Store the owning team key and display name per league and player. |
| Roster percentage | `player/{player_key}/percent_owned` | Store the returned Yahoo ownership percentage in the player metrics snapshot. |
| League-local adds and drops | `league/{league_key}/transactions` | Count successful `add`, `drop`, and `add/drop` transaction records for a selected time window. |
| Upcoming NFL matchup | Local nflverse 2026 schedule | Already independent of Yahoo; use the current NFL team from the draft snapshot and link to the scheduled game. |

## Fields not documented in the supported Fantasy API

Yahoo's current Fantasy API documentation does not document a player **start percentage** field or the Yahoo-wide **adds** and **drops** totals shown in the consumer Transaction Trends page. Bowser should leave those fields empty until Yahoo approves a source that explicitly returns them. It should not scrape the consumer page or present league-local transaction counts as Yahoo-wide trends.

## Authentication and access

Yahoo now requires an application submission and review before Fantasy API access. The approved app should use OAuth 2.0 Authorization Code flow. A user signs into Yahoo and grants Bowser access; the server stores encrypted refresh tokens, never the browser or Git repository.

Required application URLs:

- Access application: <https://sports.yahoo.com/developer/access/>
- Current Fantasy API documentation: <https://sports.yahoo.com/developer/docs/>
- OAuth 2.0 guide: <https://developer.yahoo.com/oauth2/guide/>

## Recommended sync design

1. Complete Yahoo application review and configure an HTTPS OAuth callback on the Bowser production domain.
2. Fetch the signed-in user's NFL teams with `users;use_login=1/games/teams`.
3. For every selected league, refresh league teams and rosters, then upsert `yahoo_league_ownership`.
4. Fetch `percent_owned` for mapped Yahoo player keys and upsert `yahoo_player_metrics`.
5. Fetch league transactions incrementally and derive league-local add/drop counts for a clearly labeled time window.
6. Map Yahoo player keys to nflverse GSIS player IDs through name, NFL team, and position, retaining reviewed exceptions.
7. Refresh league ownership on demand and transaction/percentage snapshots on a short cache interval to stay within Yahoo rate and freshness expectations.

The warehouse already contains empty, validated tables for `yahoo_player_metrics` and `yahoo_league_ownership`, and the Player Database has a persistent Yahoo Stats visibility toggle. Empty fields intentionally render as em dashes until an approved authenticated feed is connected.

## Attribution

When Yahoo data is displayed, include the required linked attribution: **Fantasy data provided by Yahoo Fantasy**. Follow Yahoo's current attribution and branding requirements.

Sources:

- <https://developer.yahoo.com/fantasysports/guide/>
- <https://sports.yahoo.com/developer/docs/>
- <https://developer.yahoo.com/oauth2/guide/>
- <https://developer.yahoo.com/attribution/>

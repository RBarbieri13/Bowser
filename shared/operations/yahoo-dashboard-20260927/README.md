# Yahoo team dashboard — September 27, 2026

The existing /#/yahoo route now displays the authorized user's team overview and a selected-team workspace for lineups, current standings and weekly league matchups. Read-only; no roster edits or transactions.

Data contract: https://sports.yahoo.com/developer/docs/
- Owned teams and leagues: users;use_login=1/games;game_codes=nfl;seasons=YYYY.
- Team roster for selected week, including league-context player points where returned.
- Current league standings with record, points for/against, waiver priority and FAAB balance where returned.
- Selected-week scoreboard with actual points and separately labeled Yahoo team projections.
- League roster-slot settings for unfilled-starter checks; roster flags and bye weeks for attention cues.

Security and boundaries: encrypted eight-hour HttpOnly session, per-request ownership checks, private/no-store browser and CDN responses, fixed provider paths, strict season/week/team validation, no private payload persistence. Failed independent sections display their own error; authorization failures stop the response. Statistics and projections are not copied into the public warehouse.

Verification requires npm run check, a second local/API verifier, production anonymous/private cache checks, and a live signed-in readback of actual teams. UI fixtures demonstrate layout and interaction only and are not proof of live Yahoo API access. No private fixture, token, or response body may be committed.

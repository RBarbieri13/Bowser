# Yahoo connection and live verification

Implemented for the existing Bowser app, September 24, 2026.

## Scope

`/#/yahoo` authorizes a user's Yahoo account, reads that user's NFL leagues and owned teams for the selected season, retrieves an owned team's current roster, and tests token refresh followed by a fresh league read. It does not perform transactions, change lineups, import private leagues into public snapshots, or enable background jobs. League Hub and Fantasy Intelligence remain hidden.

Configuration: `YAHOO_CLIENT_ID`, `YAHOO_CLIENT_SECRET`, `YAHOO_REDIRECT_URI` in Vercel Production. Never put credentials in VITE variables, the repository, browser JS, or operational receipts. The registered callback is `https://bowser-fantasy-football.vercel.app/api/v1/auth/yahoo/callback`.

## Session and privacy boundary

This initial interactive connection uses an eight-hour, browser-specific encrypted session, not persistent server-side account storage. OAuth tokens are encrypted with AES-256-GCM using a purpose-specific HKDF key derived from the server-held client secret. The ciphertext is carried in a Secure, HttpOnly, SameSite=Lax, host-only cookie. Browser JavaScript cannot read it; only the server decrypts it. Separate ten-minute encrypted state cookies bind callbacks to the initiating browser. Codes are removed immediately by redirect, with no-referrer/no-store response headers. Session expiry is absolute and is not extended by refreshing tokens. Oversized sessions fail closed.

All private responses disable browser and CDN caching and vary by Cookie. No tokens, private league data, manager emails, or provider error bodies are logged or written to source artifacts. Yahoo GET requests use the user's token; roster access additionally verifies team ownership within the chosen season. Mutating local session operations require a same-origin POST. Refresh rotation replaces the encrypted cookie and preserves an unchanged refresh token if Yahoo omits a replacement. Expired grants clear the session. Disconnect deletes this browser's cookie; it does not revoke the grant at Yahoo or invalidate a copied cookie. Yahoo account security can revoke the grant. Rotating the client secret also invalidates encrypted sessions.

Unattended imports, cross-device sessions, centrally revoked sessions and long-term league storage require a separate durable server-side credential store and are intentionally outside this test connection. Earlier integration-plan language describing that storage is a future stage, not implemented persistence.

## Validation

`tests/yahoo-auth.test.mjs` covers state binding, expiry, encryption tampering, privacy, canonical host handling, HTTP methods, origin enforcement, Yahoo array normalization, team ownership, refresh rotation/retry, and sanitized failures. `tests/yahoo-connection.test.jsx` covers connection visibility, roster retrieval, refresh verification, disconnect, season changes and denied API access. These use clearly synthetic fixtures; no fixture is used by application runtime.

Live user test: Open Yahoo Connection, choose Connect Yahoo, sign in with the account owning the leagues and approve read access. Check the retrieved league names, select View roster and compare with Yahoo Fantasy. Run Test token refresh. Login alone is not a successful Fantasy API test: grant provisioning can still reject Fantasy API reads with 403.

Sources:
- https://developer.yahoo.com/oauth2/guide/flows_authcode/
- https://sports.yahoo.com/developer/docs/

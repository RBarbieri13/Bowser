# Yahoo activity review — September 30, 2026

## Scope and source

Market Pulse and Waivers now expose selected-league Yahoo Adds, Drops, Total, and Net as sortable columns. Total is successful player adds plus successful player drops; Net is adds minus drops. Refresh uses the existing private league-research endpoint. These counts describe the returned league history, not Yahoo-wide popularity, not the NFL statistics week, and not Sleeper's rolling hours.

Official source: [Yahoo Fantasy Sports API documentation — Transaction APIs](https://sports.yahoo.com/developer/docs/). Its indexed current documentation confirms league-qualified transactions, per-player transaction data, type/types and count filters, and transaction status/timestamp metadata. Direct documentation fetch returned HTTP 429; official-domain search retrieval supplied these sections. No third-party API behavior is assumed.

## Verified behavior

- Backend remains GET-only, encrypted-session gated, canonical-host checked, and verifies the selected team belongs to the signed-in user's requested-season NFL teams before any league transaction read.
- Browser, CDN and Vercel CDN responses remain no-store; client fetch uses same-origin credentials and no-store. Authorized research stays in React memory and serialized request queues. No private response was persisted, logged, or committed.
- Existing provider request is bounded to 50 transactions. Coverage displays the returned count, bounded/complete-returned status, oldest/newest event timestamps, and the transaction section's own read timestamp. A later ownership-only read cannot relabel older transactions as newly captured.
- Counts require status `successful` and explicit per-player `add` or `drop` actions. Pending/failed transactions and trades do not become adds/drops. An `add/drop` transaction cannot count both actions for each player. Duplicate transaction keys and repeated player actions within one transaction count once.
- Matching uses normalized name, NFL team, and position, with conflicting Yahoo keys rejected. Missing per-player action and ambiguous identities stay unavailable. No matched events means unavailable unless an exact known Yahoo identity and complete returned history establish zero. Missing private data renders an em dash.
- The source's immutable public warehouse, public market snapshots, historical statistics and league write permissions are unchanged. The only backend addition is a transaction-section read timestamp.

## Tests

- `node --test tests/yahoo-research-private.test.mjs`: 5 passed. Covers session gate, GET-only, no-store, exact identities, malformed ownership ambiguity, normalized transaction action/status/time, and rejection of unowned teams before provider transaction reads.
- `npx vitest run tests/lhq-league-research.test.jsx`: 9 passed. Covers both page integrations, Total column, refresh request, league selector, bounded coverage, successful action counts, duplicate prevention, pending/failed exclusion, ambiguous/missing identities and actions, confirmed zero, and private-data storage exclusion.

All fixtures are synthetic test-only inputs, never production fallbacks.

## Live limitation

No signed-in Yahoo account response was read in this subtask. Therefore tests establish implementation and privacy behavior, not fresh live-account API access or live transaction totals. The deployed UI requires an existing authorized Yahoo session and a successful Read league / Refresh Yahoo activity action. A response at the 50-transaction cap is explicitly incomplete; it is not extrapolated into all-time or site-wide totals. No site-wide Yahoo transaction count source has been verified for this release.

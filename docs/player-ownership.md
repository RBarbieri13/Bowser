# Player Database LEFA ownership

LEFA is one 88px column after Finish. L, E and F map to the discovered Loongi League, LOEG and Fart League by exact normalized name, or to an explicitly selected league in each menu. A always spans every discovered authorized league, not just the three shortcuts. No account identifier or ownership observation is persisted.

- ★ mine; ● owned by another manager; ○ explicitly free or on waivers; ? unresolved/stale/disconnected; ≋ mixed across leagues.
- OR between checked statuses in one menu, AND between L/E/F/A rules. A has Any/Every. All three checked removes that rule, including for unknown observations; none checked matches no players. Partial active rules do not match unknown observations.
- Clear All restores all three statuses in all four menus and Every, leaving all other filters and sorting unchanged.
- Each menu offers mine-first/free-first sorting. For A, mine count has priority over others count; unresolved league observations sort last in both directions.
- 156px menu, 5px padding, 25px rows; no selection-count paragraph. Keyboard activation, Escape/focus return, outside close and Tab containment. Portal rendering avoids clipping by the horizontally scrolling table. LEFA width cannot shrink below 80px.

## Read contract and privacy

The existing private GET `auth/yahoo/league-research` accepts `include=ownershipPool` with bounded `availabilityStart`. Each call validates the requesting team against authenticated season membership, then reads at most 25 current Yahoo league player ownership records. Source `ownership_type` and same-league `owner_team_key` determine `owned` and `isMine`; only these booleans are returned, never another manager's identity. Mine is checked against all authenticated owned team keys, including multiple managed teams in the same league.

Browser reads are serialized through the existing Yahoo queue, round-robin across leagues. They stop at exhaustion, the existing 5,000 offset cap, errors or repeated pagination. Each observed page keeps its own checked time; observations expire after 15 minutes. A bounded five-second server/client clock allowance prevents millisecond skew from rejecting valid pages; larger future timestamps remain invalid and source times are never rewritten. A refresh clears the old capture first. Account replacement, disconnect, season change and route unmount discard/cancel the scoped capture. No absent player is inferred unowned, even after exhaustion. Identity joins require one complete unique normalized name/team/position; traded players or ambiguous identities remain unknown until an exact current match exists.

The footer reports fully checked players relative to the table's unfiltered pool, loading/partial/stale state, oldest source clock and refresh. Current ownership is independent of the chosen statistical/DFS week. Yahoo data stays in memory, is excluded from the table CSV, and uses existing no-store, session expiry and owned-team authorization boundaries. There are no new credentials or grants.

Source contract: https://sports.yahoo.com/developer/docs/ (Players collection and ownership resource).

## Verification

Model and UI regression tests cover all/none, OR/AND, Any/Every (including a fourth league), Clear All isolation, unknown/stale/ambiguous values, sort ordering, one-column placement, real hook interface, scoped cancellation and duplicate pagination. Private endpoint tests cover session/membership/no-store, explicit mine/other/free/unknown values, pagination and multiple managed teams. Fixtures are restricted to tests. Automated fixtures are not evidence of a live account read.

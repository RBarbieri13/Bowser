# Shared table controls and Market Pulse

Updated September 16, 2026. Market Pulse keeps current, real Sleeper and ESPN provider observations; no NFL projections or game statistics are inferred from their transaction and ownership populations.

## Shared contract

`src/TableSettings.jsx` exports `useTablePreferences`, `TableSettingsPanel`, and `TableColumnResize`. Pure helpers are in `src/tableSettings.js`. Table column definitions contain `key`, `label`, `group`, `width`, optional `minWidth` / `maxWidth`, `required`, `type`, `decimals`, and optional `orderable: false` for fixed identity or trend fields.

- Preference validation discards unknown keys, duplicate order/sort entries, malformed values, and hidden required identity columns. Widths are bounded. Browser storage is optional. Changing table storage keys cannot overwrite another table’s preferences.
- The portal stages changes until Apply. Cancel/Escape/backdrop dismissal preserve the previous applied settings. Focus remains in the open dialog and returns to the opener when closed.
- Group visibility, order, explicit widths, compact/comfortable density, source/whole/one-decimal precision, conditional colors, bounded content-width fitting, numeric/all/compact presets, and up to twelve named views are supported.
- Consumers apply density, formatting, colors and bounded content-width fitting to their actual table. The shared panel does not rewrite table DOM behind the consumer's back.
- Resizers support pointer dragging and keyboard arrows (5 px; Shift 25 px), Home, and End. Position the header relatively.
- Sorting preserves original ties, supports ordered secondary sorts, handles negative values and zero, and leaves unavailable values last. Missing values render as an em dash.

## Market Pulse

Uses the shared settings, saved under `bowser:market-pulse:table:v2`. Existing watchlists and primary-sort preferences are preserved from the prior storage key. Every leaf header can be sorted and resized; Shift-click adds secondary sorts. Groups follow the displayed column order, including after fields are hidden or moved.

Filters include name/team search, position, team, watchlist, source presence, matched/unmatched identities, and independent min/max ranges for adds, drops, net adds, add share, roster percentage, start percentage, and roster percentage-point change. An active numeric filter excludes missing values rather than interpreting them as zero.

Player-name clicks invoke the application-wide `onOpenPlayer` identity resolver with the source player's name, position, team, provider IDs, and season. A separate History action opens Market Pulse observations. Unknown warehouse IDs remain null for the resolver; provider IDs are not passed as invented warehouse IDs.

History controls expose the actual fields supplied by each provider and 5, 10, 16, 32, or 96 historical observations. They are labeled as observations, not NFL games. For a source/window/metric, all players share the same zero-inclusive scale. Negative observations extend below zero; missing records are gaps. These browser-local observations are not a substitute for archived NFL weekly statistics.

## Verification

- `npx vitest run tests/table-settings.test.jsx tests/market-table-upgrade.test.jsx tests/market-pulse-ui.test.jsx`: 28 tests passed.
- Existing Market Pulse source/cache/CSV/matching coverage remains unchanged.
- Integration must include the two new focused test files in the root package checks and verify the final viewport styling with the other upgraded pages.

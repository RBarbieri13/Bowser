# Bowser development instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Durable application rules

- The product name is Bowser. Use that name consistently in project metadata and product-level documentation.
- nflverse source data is immutable input. Never hand-edit warehouse values or replace imported rows with mock statistics.
- The app is read-only in this phase. Controls may query, filter, sort and select, but must not mutate player data.
- The grain of `player_week_stats` is player, team, season type and NFL week. Preserve it for future 2026 incremental loads.
- Run `npm run check` after warehouse, API or table changes. Do not weaken completeness checks to make a build pass.
- Before pushing a repository update, run `npm run check` and confirm `git status --short` contains only intended files.
- Keep external credentials out of source and local data artifacts.

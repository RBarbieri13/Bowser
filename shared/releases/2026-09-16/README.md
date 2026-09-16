# Bowser release — September 16, 2026

Integrated current Waivers, Market Pulse, DraftKings Week 1 pricing/projections, refreshed 2026 Week 1 nflverse statistics, public waiver research desk and source supplement, and pending News engine implementation.

Validation: full npm run check and independent verifier PASS. Original main checkout and 2025 warehouse preserved. Week 2 waiver recommendations use completed Week 1 performance; publisher capture dates remain explicit.

News code preserves provider credential/access gates and requires configured durable storage before live refresh. No paid provider ingestion was triggered for this release.

GitHub sync is blocked by unavailable CLI credentials and connector write permissions; Vercel deployment is performed directly from this isolated release worktree.

Production verified: https://fantasy-football-stats-preview.vercel.app/#/waivers

Deployment: dpl_CX6v6FRhJvQXtGNPet8N1FPgAS5W (READY), application commit 316deea5014f53457e1c525ca6e5ff8e27d8e306. Full public API readbacks, live Sleeper/ESPN refresh, research artifact hashes, waiver filters, favorite bid/note persistence, reloads, Player Database 2026 selection and News source registry all PASS. See production-verification.json.

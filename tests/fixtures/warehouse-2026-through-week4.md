# Dated public nflverse regression fixture

Exact, unmodified 2026 warehouse capture imported October 11, 2026, covering four complete weeks and the Week 5 Thursday game. Compressed only to keep the repository small. Contains public statistics only; no Yahoo data.

Uncompressed SHA-256: `4bec9351ea5d1164bfd0b3289c18699ef5a8fbe173105a6906b5d3f6a2f9bf1f`

`warehouse-2026.test.mjs` keeps its exact historical and pregame assertions against this fixture. A separate active-warehouse test compares current metadata to the verified source report and database; `verify_warehouse_2026.py` checks every current source statistic and snap. Never rewrite this fixture to advance a week.

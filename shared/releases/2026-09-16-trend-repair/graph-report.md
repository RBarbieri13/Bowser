# bowser-trend-repair

**Objective:** Repair aligned cross-season trends, shared scales and selectable metrics, Opportunity filters, column controls, DFS weekly refresh, and positional finishes; deploy verified app.
**Anchors:** Immutable 2025/2026 warehouses and actual SQL values, npm run check exits zero, Permanent production browser/API readbacks
**Frozen rules:** No fabricated historical stats, prices, projections, or rankings, Do not edit original dirty Bowser checkout or weaken completeness gates

- nodes: 8  edges: 6
- runs: 8  cost: $0.00 / budget {'work_units': 8, 'concurrent_workers': 3, 'total_agents_max': 8, 'wall_clock_min': 120, 'retries_per_node': 2, 'min_evidence_per_claim': 1, 'token_ceiling': 120000}
- claims kept: 5  dropped: 0  unverified: 0

## Surviving claims

- Aligned regular-season history and weekly positional ranks agree with source SQL  
  ↳ source: artifacts/trend-repair/verify-semantics.json
- Current Week 2 salary and projection data match official DK and FIC sources  
  ↳ source: artifacts/trend-repair/verify-dfs.json
- Current DFS metadata is dated 2026 Week 2 and verified September 16  
  ↳ source: artifacts/trend-repair/verify-dfs.json
- Shared metric menus and filters preserve cross-page meaning and history  
  ↳ source: artifacts/trend-repair/verify-ui.json
- Public deployment is READY and API/browser checks pass; recurring schedule activation remains awaiting explicit user confirmation after automatic review rejection  
  ↳ source: shared/releases/2026-09-16-trend-repair/deployment.json

Overall task status: application repair and deployment complete; recurring schedule activation is blocked pending requested user confirmation. The active-automation portion of the original done-condition is not yet satisfied.

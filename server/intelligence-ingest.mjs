import { randomUUID } from "node:crypto";

import { deduplicateIntelligenceEvents } from "./intelligence-dedup.mjs";
import { defaultIntelligenceStore, intelligenceHash } from "./intelligence-db.mjs";
import { scanLiveIntelligence } from "./intelligence-live.mjs";
import { priorityXRegistry } from "./intelligence-x-priority.mjs";

export async function executeIntelligenceRun(options = {}) {
  const store = options.store || defaultIntelligenceStore();
  const request = {
    source: options.source || "all",
    lookbackHours: Math.max(1, Math.min(168, Number(options.lookbackHours) || 24)),
    positions: options.positions || ["QB", "RB", "WR", "TE"],
    teams: options.teams || [],
    query: options.query || "",
  };
  const requestHash = intelligenceHash(request);
  const idempotencyKey = options.idempotencyKey || randomUUID();
  const started = await store.beginRun({
    idempotencyKey,
    requestHash,
    providers: request.source === "all" ? ["all-ready"] : [request.source],
    handleSetVersion: priorityXRegistry().version,
  });
  if (started.replay) {
    if (started.status === "failed") { const error = new Error("The prior refresh for this idempotency key failed; use a new key to retry"); error.code = "prior_run_failed"; throw error; }
    return { replay: true, inProgress: started.status === "running", run: started, events: await store.activeEvents() };
  }
  try {
    const live = await (options.scan || scanLiveIntelligence)(request);
    const deduplicated = deduplicateIntelligenceEvents(live.events);
    const promoted = await store.promote({ runId: started.runId, events: deduplicated.events, quarantine: deduplicated.quarantine, providers: live.meta.provider?.activeSources || [] });
    return {
      replay: false,
      run: promoted.run,
      snapshot: promoted.snapshot,
      noChange: promoted.noChange,
      events: deduplicated.events,
      quarantineCount: deduplicated.quarantine.length,
      provider: live.meta.provider,
    };
  } catch (error) {
    await store.fail(started.runId, error);
    throw error;
  }
}

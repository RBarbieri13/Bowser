import { IntelligenceProviderError } from "./intelligence-errors.mjs";
import { scanWithThirtyTwoBeatWriters, thirtyTwoBeatWritersStatus } from "./intelligence-provider-32bw.mjs";
import { scanWithRotoWire, rotoWireStatus } from "./intelligence-provider-rotowire.mjs";
import { scanWithXai, xaiProviderStatus } from "./intelligence-provider-xai.mjs";
import { scanWithFantasyPros, fantasyProsStatus } from "./intelligence-provider-fantasypros.mjs";
import { scanWithSleeper, sleeperStatus } from "./intelligence-provider-sleeper.mjs";
import { scanWithFantasyCalc, fantasyCalcStatus } from "./intelligence-provider-fantasycalc.mjs";
import { consolidateEvents } from "./intelligence-schema.mjs";

const PROVIDERS = {
  xai: { status: xaiProviderStatus, scan: scanWithXai, core: true },
  fantasypros: { status: fantasyProsStatus, scan: scanWithFantasyPros, core: true },
  sleeper: { status: sleeperStatus, scan: scanWithSleeper, core: true },
  "32bw": { status: thirtyTwoBeatWritersStatus, scan: scanWithThirtyTwoBeatWriters, core: true },
  rotowire: { status: rotoWireStatus, scan: scanWithRotoWire, core: false },
  fantasycalc: { status: fantasyCalcStatus, scan: scanWithFantasyCalc, core: false },
};

function selectedProviderIds(source) {
  const requested = String(source || "all").toLowerCase();
  if (requested === "all") return Object.keys(PROVIDERS);
  if (!PROVIDERS[requested]) throw new IntelligenceProviderError("unknown_provider", `Unknown live intelligence source: ${requested}`, 400);
  return [requested];
}

function eventMatches(event, options, cutoff) {
  const positions = options.positions || [];
  const teams = options.teams || [];
  const query = String(options.query || "").trim().toLowerCase();
  if (positions.length && !positions.includes(event.player.position)) return false;
  if (teams.length && !teams.includes(event.player.team)) return false;
  if (Date.parse(event.lastUpdatedAt) < cutoff) return false;
  if (!query) return true;
  return [event.player.name, event.player.team, event.headline, event.summary, event.fantasyAnalysis]
    .filter(Boolean).join(" ").toLowerCase().includes(query);
}

export function liveProviderStatus() {
  const sources = Object.fromEntries(Object.entries(PROVIDERS).map(([id, provider]) => [id, { ...provider.status(), core: provider.core }]));
  const ready = Object.values(sources).filter((source) => source.ready ?? source.configured);
  return {
    id: "bowser-live-intelligence",
    configured: ready.length > 0,
    model: sources.xai?.model || "source adapters",
    capabilities: [...new Set(ready.flatMap((source) => source.capabilities || []))],
    message: `${ready.length} live source${ready.length === 1 ? "" : "s"} ready.`,
    sources,
  };
}

export async function scanLiveIntelligence(options = {}) {
  const lookbackHours = Math.max(1, Math.min(168, Number(options.lookbackHours) || 24));
  const requested = selectedProviderIds(options.source);
  const statuses = Object.fromEntries(requested.map((id) => [id, PROVIDERS[id].status()]));
  const runnable = requested.filter((id) => statuses[id].ready ?? statuses[id].configured);
  if (!runnable.length) {
    const message = requested.length === 1 ? statuses[requested[0]].message : "No live intelligence sources are configured.";
    throw new IntelligenceProviderError("provider_not_configured", message, 503, requested.length === 1 ? requested[0] : null);
  }

  const results = await Promise.all(runnable.map(async (id) => {
    try { return { status: "fulfilled", value: { id, result: await PROVIDERS[id].scan({ ...options, lookbackHours }) } }; }
    catch (reason) { return { status: "rejected", id, reason }; }
  }));
  const successes = results.filter((result) => result.status === "fulfilled").map((result) => result.value);
  const failures = results.filter((result) => result.status === "rejected").map((result) => ({
    provider: result.id,
    code: result.reason?.code || "provider_error",
    message: result.reason instanceof Error ? result.reason.message : "Provider failed",
  }));
  if (!successes.length) {
    const first = results.find((result) => result.status === "rejected")?.reason;
    if (first instanceof IntelligenceProviderError) throw first;
    throw new IntelligenceProviderError("all_providers_failed", failures[0]?.message || "All live intelligence providers failed", 502);
  }

  const failedProviders = new Set(failures.map((failure) => failure.provider));
  const failedReady = runnable.filter((id) => failedProviders.has(id));
  if (failedReady.length) {
    throw new IntelligenceProviderError("provider_set_incomplete", `Refresh aborted because a ready source failed: ${failedReady.join(", ")}`, 502, failedReady[0]);
  }

  const cutoff = Date.now() - lookbackHours * 60 * 60 * 1000;
  const events = consolidateEvents(successes.flatMap(({ result }) => result.events)).filter((event) => eventMatches(event, options, cutoff));
  const status = liveProviderStatus();
  return {
    meta: {
      version: 1,
      generatedAt: new Date().toISOString(),
      snapshotMode: "live_multi_source",
      lookbackHours,
      total: events.length,
      returned: events.length,
      provider: { ...status, activeSources: successes.map(({ id }) => id), failures },
      methodology: {
        confidence: "Source authority and corroboration only; supplementary RSS never overrides a core source.",
        sentiment: "Fantasy-value direction from -100 to +100; distinct from factual confidence.",
        buzz: "Discussion velocity; distinct from sentiment and reporting confidence.",
      },
    },
    events,
  };
}

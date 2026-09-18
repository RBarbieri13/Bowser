import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { liveProviderStatus } from "./intelligence-live.mjs";
import { defaultIntelligenceStore, intelligenceDatabaseStatus } from "./intelligence-db.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const feed = JSON.parse(readFileSync(path.join(root, "data", "intelligence-feed.json"), "utf8"));
const registry = JSON.parse(readFileSync(path.join(root, "data", "intelligence-sources.json"), "utf8"));
const xRegistry = JSON.parse(readFileSync(path.join(root, "data", "intelligence-x-handles.json"), "utf8"));
const ALLOWED = {
  position: new Set(["QB", "RB", "WR", "TE"]),
  impact: new Set(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  status: new Set(["CONFIRMED", "REPORTED", "STRONG_INDICATION", "RUMOR", "SPECULATION"]),
  eventType: new Set(["INJURY", "PRACTICE", "ROLE_CHANGE", "DEPTH_CHART", "TRANSACTION", "COACH_COMMENT", "PERFORMANCE", "SUSPENSION", "RUMOR", "OTHER"]),
};
const IMPACT_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

function values(params, key) {
  return String(params.get(key) || "").split(",").map((item) => item.trim().toUpperCase()).filter(Boolean);
}
function validateList(params, key, allowed) {
  const list = values(params, key);
  const invalid = list.find((value) => !allowed.has(value));
  if (invalid) throw new IntelligenceQueryError(key, `Unsupported ${key}: ${invalid}`);
  return list;
}
function integer(params, key, fallback, minimum, maximum) {
  if (!params.has(key)) return fallback;
  const value = Number(params.get(key));
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new IntelligenceQueryError(key, `${key} must be an integer from ${minimum} to ${maximum}`);
  return value;
}
function contains(event, search) {
  if (!search) return true;
  return [event.player?.name, event.player?.team, event.headline, event.summary, event.fantasyAnalysis, event.eventType]
    .filter(Boolean).join(" ").toLowerCase().includes(search);
}

export class IntelligenceQueryError extends Error {
  constructor(field, message) { super(message); this.name = "IntelligenceQueryError"; this.field = field; }
}

export function getIntelligenceRegistry() {
  return {
    ...registry,
    xAccounts: xRegistry.handles.map((account) => ({ ...account, handle: `@${account.handle}` })),
    summary: registry.sources.reduce((result, source) => {
      result.total += 1;
      result[source.adoption] = (result[source.adoption] || 0) + 1;
      return result;
    }, { total: 0 }),
  };
}

function queryEvents(events, params, snapshotMode, generatedAt) {
  const positions = validateList(params, "position", ALLOWED.position);
  const impacts = validateList(params, "impact", ALLOWED.impact);
  const statuses = validateList(params, "status", ALLOWED.status);
  const eventTypes = validateList(params, "eventType", ALLOWED.eventType);
  const teams = values(params, "team");
  const hours = integer(params, "hours", 168, 1, 720);
  const limit = integer(params, "limit", 50, 1, 100);
  const search = String(params.get("search") || "").trim().toLowerCase().slice(0, 100);
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const matching = events
    .filter((event) => !positions.length || positions.includes(event.player.position))
    .filter((event) => !teams.length || teams.includes(event.player.team))
    .filter((event) => !impacts.length || impacts.includes(event.fantasyImpact))
    .filter((event) => !statuses.length || statuses.includes(event.status))
    .filter((event) => !eventTypes.length || eventTypes.includes(event.eventType))
    .filter((event) => !Number.isFinite(Date.parse(event.lastUpdatedAt)) || Date.parse(event.lastUpdatedAt) >= cutoff)
    .filter((event) => contains(event, search))
    .sort((a, b) => (IMPACT_ORDER[a.fantasyImpact] - IMPACT_ORDER[b.fantasyImpact]) || Date.parse(b.lastUpdatedAt) - Date.parse(a.lastUpdatedAt));
  return {
    meta: {
      generatedAt,
      snapshotMode,
      lookbackHours: hours,
      total: matching.length,
      returned: Math.min(limit, matching.length),
      provider: { ...liveProviderStatus(), storage: intelligenceDatabaseStatus() },
      methodology: {
        confidence: "Source authority and corroboration only; social volume never increases factual confidence.",
        sentiment: "Fantasy-value direction from -100 to +100; distinct from factual confidence.",
        buzz: "Discussion velocity; distinct from sentiment and reporting confidence.",
      },
    },
    events: matching.slice(0, limit),
  };
}

export function queryIntelligenceFeed(params = new URLSearchParams()) {
  return queryEvents(feed.events, params, feed.mode, feed.generatedAt);
}

export async function queryPersistedIntelligenceFeed(params = new URLSearchParams()) {
  if (!intelligenceDatabaseStatus().ready) return queryIntelligenceFeed(params);
  const store = defaultIntelligenceStore();
  if (!await store.hasActiveSnapshot()) return queryIntelligenceFeed(params);
  const events = await store.activeEvents();
  const generatedAt = events.length ? events.reduce((latest, event) => Date.parse(event.lastUpdatedAt) > Date.parse(latest) ? event.lastUpdatedAt : latest, events[0].lastUpdatedAt) : new Date().toISOString();
  return queryEvents(events, params, "durable_active_snapshot", generatedAt);
}

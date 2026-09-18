import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

import { canonicalEventKey, canonicalizeSourceUrl, observationFingerprint, xPostId } from "./intelligence-dedup.mjs";

const migrations = ["001_intelligence.sql", "002_snapshot_revision.sql", "003_snapshot_provider_coverage.sql"].map((name) => readFileSync(fileURLToPath(new URL(`../db/migrations/${name}`, import.meta.url)), "utf8"));
const migrationStatements = migrations.flatMap((migration) => migration.split(";").map((statement) => statement.trim()).filter(Boolean));
let sqlClient;
let migrationPromise;

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function intelligenceHash(value) {
  return createHash("sha256").update(stable(value)).digest("hex");
}

export function intelligenceDatabaseStatus() {
  const configured = Boolean(process.env.DATABASE_URL);
  return { configured, ready: configured, provider: configured ? "neon-postgres" : null, message: configured ? "Durable intelligence storage is configured." : "Add a Vercel Marketplace Neon DATABASE_URL to persist refreshes." };
}

function getSql() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  if (!sqlClient) sqlClient = neon(process.env.DATABASE_URL);
  return sqlClient;
}

async function ensureSchema(sql = getSql()) {
  if (!migrationPromise) migrationPromise = sql.transaction(migrationStatements.map((statement) => sql.query(statement)));
  await migrationPromise;
  return sql;
}

function sanitizedError(error) {
  return String(error instanceof Error ? error.message : error).replace(/(bearer|token|key|password)\s+[^\s,;]+/gi, "$1 [redacted]").slice(0, 500);
}

function observations(event) {
  return (event.sources || []).map((source, index) => {
    let canonicalUrl = source.url;
    try { canonicalUrl = canonicalizeSourceUrl(source.url); } catch {}
    const providerId = String(source.sourceName || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const providerItemId = xPostId(source.url) || `${event.eventId}:${index}`;
    return {
      fingerprint: observationFingerprint({ providerId, providerItemId, url: canonicalUrl, author: source.author, publishedAt: source.publishedAt, content: `${event.headline} ${event.summary}` }),
      providerId, providerItemId, canonicalUrl, xPostId: xPostId(source.url), author: source.author, xHandle: source.xHandle,
      publishedAt: source.publishedAt, eventId: event.eventId,
      metadata: { sourceType: source.sourceType, isOriginalSource: source.isOriginalSource },
    };
  });
}

export function createMemoryIntelligenceStore() {
  const runs = new Map();
  const snapshots = [];
  const quarantined = [];
  return {
    async beginRun({ idempotencyKey, requestHash, providers, handleSetVersion }) {
      const existing = runs.get(idempotencyKey);
      if (existing) {
        if (existing.requestHash !== requestHash) { const error = new Error("Idempotency key already used for a different request"); error.code = "idempotency_conflict"; throw error; }
        return { ...existing, replay: true };
      }
      if ([...runs.values()].some((item) => item.status === "running")) { const error = new Error("Another intelligence refresh is already running"); error.code = "refresh_in_progress"; throw error; }
      const run = { runId: randomUUID(), idempotencyKey, requestHash, providers, handleSetVersion, status: "running", counters: {}, startedAt: new Date().toISOString(), replay: false };
      runs.set(idempotencyKey, run); return { ...run };
    },
    async promote({ runId, events, quarantine = [], providers = [] }) {
      const normalizedProviders = [...new Set(providers)].sort();
      const contentHash = intelligenceHash({ events, providers: normalizedProviders });
      const current = snapshots.at(-1);
      const run = [...runs.values()].find((item) => item.runId === runId);
      const removedProviders = (current?.providers || []).filter((provider) => !normalizedProviders.includes(provider));
      if (removedProviders.length) { const error = new Error(`Refresh would remove active providers: ${removedProviders.join(", ")}`); error.code = "provider_coverage_regression"; throw error; }
      quarantined.push(...quarantine.map((item) => ({ runId, ...item })));
      if (current?.contentHash === contentHash) { Object.assign(run, { status: "no_change", counters: { events: events.length, quarantined: quarantine.length }, finishedAt: new Date().toISOString() }); return { run: { ...run }, snapshot: current, noChange: true }; }
      const snapshot = { snapshotId: randomUUID(), runId, contentHash, providers: normalizedProviders, events: structuredClone(events), createdAt: new Date().toISOString() };
      snapshots.push(snapshot); Object.assign(run, { status: "promoted", counters: { events: events.length, quarantined: quarantine.length }, finishedAt: new Date().toISOString() });
      return { run: { ...run }, snapshot, noChange: false };
    },
    async fail(runId, error) { const run = [...runs.values()].find((item) => item.runId === runId); if (run) Object.assign(run, { status: "failed", error: sanitizedError(error), finishedAt: new Date().toISOString() }); },
    async activeEvents() { return structuredClone(snapshots.at(-1)?.events || []); },
    async hasActiveSnapshot() { return snapshots.length > 0; },
    async run(runId) { return structuredClone([...runs.values()].find((item) => item.runId === runId) || null); },
    async latestRun() { return structuredClone([...runs.values()].at(-1) || null); },
    async quarantine() { return structuredClone(quarantined); },
  };
}

export function createPostgresIntelligenceStore(options = {}) {
  const sql = options.sql || getSql();
  return {
    async beginRun({ idempotencyKey, requestHash, providers, handleSetVersion }) {
      await ensureSchema(sql);
      await sql.query("UPDATE intelligence_runs SET status='failed',error_code='lease_expired',error_message='Refresh lease expired before completion',finished_at=now() WHERE status='running' AND started_at < now() - interval '15 minutes'", []);
      let inserted = [];
      try {
        inserted = await sql.query(`INSERT INTO intelligence_runs (run_id,idempotency_key,request_hash,requested_providers,handle_set_version,status) VALUES ($1,$2,$3,$4::jsonb,$5,'running') ON CONFLICT (idempotency_key) DO NOTHING RETURNING run_id`, [randomUUID(), idempotencyKey, requestHash, JSON.stringify(providers), handleSetVersion]);
      } catch (error) {
        if (String(error?.message || "").includes("idx_intelligence_one_running")) { error.code = "refresh_in_progress"; error.message = "Another intelligence refresh is already running"; }
        throw error;
      }
      const [run] = await sql.query("SELECT * FROM intelligence_runs WHERE idempotency_key=$1", [idempotencyKey]);
      if (run.request_hash !== requestHash) { const error = new Error("Idempotency key already used for a different request"); error.code = "idempotency_conflict"; throw error; }
      return { runId: run.run_id, requestHash: run.request_hash, status: run.status, replay: inserted.length === 0 };
    },
    async promote({ runId, events, quarantine = [], providers = [] }) {
      await ensureSchema(sql);
      const normalizedProviders = [...new Set(providers)].sort();
      const contentHash = intelligenceHash({ events, providers: normalizedProviders });
      const [active] = await sql.query("SELECT s.* FROM intelligence_state st JOIN intelligence_snapshots s ON s.snapshot_id=st.active_snapshot_id WHERE st.singleton=true", []);
      if (active && !active.provider_coverage_known) { const error = new Error("The active legacy snapshot has no verified provider coverage; backfill or explicitly retire it before refreshing"); error.code = "provider_coverage_unknown"; throw error; }
      const removedProviders = (active?.provider_ids || []).filter((provider) => !normalizedProviders.includes(provider));
      if (removedProviders.length) { const error = new Error(`Refresh would remove active providers: ${removedProviders.join(", ")}`); error.code = "provider_coverage_regression"; throw error; }
      if (active?.content_hash === contentHash) {
        const queries = quarantine.map((item) => sql.query("INSERT INTO intelligence_quarantine (run_id,reason_code,payload) VALUES ($1,$2,$3::jsonb)", [runId, item.reason, JSON.stringify(item.event)]));
        queries.push(sql.query("UPDATE intelligence_runs SET status='no_change',counters=$2::jsonb,finished_at=now() WHERE run_id=$1", [runId, JSON.stringify({ events: events.length, quarantined: quarantine.length })]));
        await sql.transaction(queries);
        return { run: await this.run(runId), snapshot: { snapshotId: active.snapshot_id, contentHash }, noChange: true };
      }
      const snapshotId = randomUUID();
      const queries = [];
      for (const event of events) {
        const revisionHash = intelligenceHash({ eventId: event.eventId, payload: event });
        queries.push(sql.query(`INSERT INTO intelligence_events (event_id,canonical_key,player_id,event_type,current_revision_hash,first_reported_at,last_updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (event_id) DO UPDATE SET current_revision_hash=EXCLUDED.current_revision_hash,last_updated_at=EXCLUDED.last_updated_at`, [event.eventId, canonicalEventKey(event), event.player?.playerId, event.eventType, revisionHash, event.firstReportedAt, event.lastUpdatedAt]));
        queries.push(sql.query("INSERT INTO intelligence_event_revisions (revision_hash,event_id,payload) VALUES ($1,$2,$3::jsonb) ON CONFLICT DO NOTHING", [revisionHash, event.eventId, JSON.stringify(event)]));
        for (const observation of observations(event)) queries.push(sql.query(`INSERT INTO intelligence_observations (observation_fingerprint,provider_id,provider_item_id,canonical_url,x_post_id,author,x_handle,published_at,event_id,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) ON CONFLICT (observation_fingerprint) DO NOTHING`, [observation.fingerprint, observation.providerId, observation.providerItemId, observation.canonicalUrl, observation.xPostId, observation.author, observation.xHandle, observation.publishedAt, observation.eventId, JSON.stringify(observation.metadata)]));
      }
      queries.push(sql.query("UPDATE intelligence_snapshots SET status='superseded' WHERE snapshot_id=(SELECT active_snapshot_id FROM intelligence_state WHERE singleton=true)", []));
      queries.push(sql.query("INSERT INTO intelligence_snapshots (snapshot_id,run_id,status,content_hash,provider_ids,provider_coverage_known) VALUES ($1,$2,'accepted',$3,$4::jsonb,true)", [snapshotId, runId, contentHash, JSON.stringify(normalizedProviders)]));
      for (const event of events) queries.push(sql.query("INSERT INTO intelligence_snapshot_events (snapshot_id,event_id,revision_hash) VALUES ($1,$2,$3)", [snapshotId, event.eventId, intelligenceHash({ eventId: event.eventId, payload: event })]));
      for (const item of quarantine) queries.push(sql.query("INSERT INTO intelligence_quarantine (run_id,reason_code,payload) VALUES ($1,$2,$3::jsonb)", [runId, item.reason, JSON.stringify(item.event)]));
      queries.push(sql.query("UPDATE intelligence_state SET active_snapshot_id=$1,updated_at=now() WHERE singleton=true", [snapshotId]));
      queries.push(sql.query("UPDATE intelligence_runs SET status='promoted',counters=$2::jsonb,finished_at=now() WHERE run_id=$1", [runId, JSON.stringify({ events: events.length, quarantined: quarantine.length })]));
      await sql.transaction(queries);
      return { run: await this.run(runId), snapshot: { snapshotId, contentHash }, noChange: false };
    },
    async fail(runId, error) { await ensureSchema(sql); await sql.query("UPDATE intelligence_runs SET status='failed',error_code=$2,error_message=$3,finished_at=now() WHERE run_id=$1", [runId, error?.code || "refresh_failed", sanitizedError(error)]); },
    async activeEvents() { await ensureSchema(sql); const rows = await sql.query(`SELECT r.payload FROM intelligence_state st JOIN intelligence_snapshot_events se ON se.snapshot_id=st.active_snapshot_id JOIN intelligence_events e ON e.event_id=se.event_id JOIN intelligence_event_revisions r ON r.revision_hash=se.revision_hash WHERE st.singleton=true ORDER BY e.last_updated_at DESC`, []); return rows.map((row) => row.payload); },
    async hasActiveSnapshot() { await ensureSchema(sql); const [row] = await sql.query("SELECT active_snapshot_id IS NOT NULL AS active FROM intelligence_state WHERE singleton=true", []); return Boolean(row?.active); },
    async run(runId) { await ensureSchema(sql); const [row] = await sql.query("SELECT run_id,status,counters,error_code,error_message,started_at,finished_at FROM intelligence_runs WHERE run_id=$1", [runId]); return row || null; },
    async latestRun() { await ensureSchema(sql); const [row] = await sql.query("SELECT run_id,status,counters,error_code,error_message,started_at,finished_at FROM intelligence_runs ORDER BY started_at DESC LIMIT 1", []); return row || null; },
  };
}

export function defaultIntelligenceStore() {
  return createPostgresIntelligenceStore();
}

export async function ensureIntelligenceSchema() {
  await ensureSchema();
  return intelligenceDatabaseStatus();
}

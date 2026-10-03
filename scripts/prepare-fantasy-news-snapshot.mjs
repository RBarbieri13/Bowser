import { createHash, randomUUID } from "node:crypto";
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { repositorySnapshotHash, validateRepositorySnapshot } from "../server/fantasy-news-repository.mjs";

// Editorial companion remains separate from the immutable public GET envelope.
export { ROLE_CHAINS } from "./news/role-chains.js";

const MAX_BYTES = 512 * 1024;
const USAGE = "Usage: node scripts/prepare-fantasy-news-snapshot.mjs --events public-events.json --checked-at ISO --updated-at ISO --revision ID [--previous previous-snapshot.json] [--out prepared-snapshot.json]";

function failure(code, message) { const error = new Error(message); error.code = code; return error; }
function calendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  return month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function normalizedEvents(input) {
  if (!Array.isArray(input)) throw failure("events_array_required", "The input must be a public events array.");
  const events = structuredClone(input);
  const ids = new Set();
  for (const event of events) {
    if (!event || typeof event.eventId !== "string" || !event.eventId || event.eventId !== event.eventId.trim() || event.eventId.length > 240) throw failure("stable_event_id_required", "Every public report requires its original bounded stable event ID.");
    if (ids.has(event.eventId)) throw failure("duplicate_event_id", "Duplicate event IDs must be resolved against their original sources before preparing a snapshot.");
    ids.add(event.eventId);
    for (const source of Array.isArray(event.sources) ? event.sources : []) {
      if (!source || typeof source !== "object") continue;
      if (source.publishedAt == null && (source.publishedAtRaw == null || source.publishedAtRaw === "")) {
        if (!calendarDate(source.publishedDate)) throw failure("source_publication_date_required", "An unavailable publication date requires explicit null publication fields, a source-native unavailable-clock explanation and a valid citation check; verification and writer dates cannot substitute for publication dates.");
        source.publishedAt = null;
        source.publishedAtRaw = `${source.publishedDate} (publication clock and timezone unavailable)`;
      }
    }
  }
  return events.sort((left, right) => left.eventId < right.eventId ? -1 : left.eventId > right.eventId ? 1 : 0);
}

export function fantasyNewsMaterialHash(snapshot) {
  // Event order is canonicalized by stable ID; publication and event-edit clocks remain material.
  const events = normalizedEvents(snapshot.events).map((event) => {
    const { checkedAt: _recordCheck, ...report } = event;
    return { ...report, sources: report.sources.map((source) => { const { checkedAt: _sourceCheck, ...citation } = source; return citation; }) };
  });
  return createHash("sha256").update(canonical({ version: snapshot.version, scope: snapshot.scope, mode: snapshot.mode, events })).digest("hex");
}

export function prepareFantasyNewsSnapshot(input, { previous = null, checkedAt, updatedAt, revision, now = Date.now() } = {}) {
  if (previous !== null) validateRepositorySnapshot(previous, { now });
  const snapshot = {
    version: 1, scope: "public_nfl_news", mode: "repository_public_snapshot",
    checkedAt, updatedAt, revision, events: normalizedEvents(input),
  };
  snapshot.contentHash = repositorySnapshotHash(snapshot);
  validateRepositorySnapshot(snapshot, { now });
  const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
  if (Buffer.byteLength(serialized, "utf8") > MAX_BYTES) throw failure("repository_too_large", "The prepared public snapshot exceeds the reader's 512 KiB limit.");
  const materialHash = fantasyNewsMaterialHash(snapshot);
  if (previous && materialHash === fantasyNewsMaterialHash(previous)) return { changed: false, reason: "unchanged_public_content", materialHash, snapshot: previous };
  if (previous && (Date.parse(snapshot.updatedAt) <= Date.parse(previous.updatedAt) || snapshot.revision === previous.revision || Date.parse(snapshot.checkedAt) < Date.parse(previous.checkedAt))) throw failure("repository_revision_regression", "Changed public content requires a new revision, a later writer time and a non-regressing source-check time.");
  return { changed: true, materialHash, snapshot };
}

function argumentsForCli(args) {
  const allowed = new Set(["events", "previous", "checked-at", "updated-at", "revision", "out"]);
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(args[index]);
    if (!match || !allowed.has(match[1]) || Object.hasOwn(result, match[1])) throw failure("invalid_arguments", USAGE);
    const value = match[2] ?? args[++index];
    if (!value || value.startsWith("--")) throw failure("invalid_arguments", USAGE);
    result[match[1]] = value;
  }
  if (["events", "checked-at", "updated-at", "revision"].some((key) => !result[key])) throw failure("invalid_arguments", USAGE);
  return result;
}

function readJsonFile(filename, label) {
  let bytes;
  try { bytes = readFileSync(filename); } catch { throw failure("input_unavailable", `The ${label} file could not be read.`); }
  if (bytes.byteLength > MAX_BYTES) throw failure("repository_too_large", `The ${label} file exceeds the 512 KiB input limit.`);
  try { return JSON.parse(bytes.toString("utf8")); } catch { throw failure("input_invalid_json", `The ${label} file is not valid JSON.`); }
}

export function runSnapshotPreparationCli(args) {
  if (args.length === 1 && args[0] === "--help") return { help: USAGE };
  const options = argumentsForCli(args);
  const previous = options.previous ? readJsonFile(options.previous, "previous snapshot") : null;
  if (options.previous) validateRepositorySnapshot(previous);
  const result = prepareFantasyNewsSnapshot(readJsonFile(options.events, "public events"), {
    previous,
    checkedAt: options["checked-at"], updatedAt: options["updated-at"], revision: options.revision,
  });
  const summary = {
    changed: result.changed, reason: result.reason || null, materialHash: result.materialHash,
    revision: result.snapshot.revision, contentHash: result.snapshot.contentHash, eventCount: result.snapshot.events.length,
  };
  if (options.out && result.changed) {
    const destination = path.resolve(options.out);
    const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, `${JSON.stringify(result.snapshot, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
      renameSync(temporary, destination);
    } finally { rmSync(temporary, { force: true }); }
    summary.outputPath = destination;
  } else if (!options.out && result.changed) summary.snapshot = result.snapshot;
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = runSnapshotPreparationCli(process.argv.slice(2));
    console.log(result.help || JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ error: { code: error?.code || "snapshot_preparation_failed", message: error?.code ? error.message : "The local public snapshot could not be prepared." } }));
    process.exitCode = 1;
  }
}

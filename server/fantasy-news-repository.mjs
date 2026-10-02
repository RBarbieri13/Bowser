import { createHash } from "node:crypto";
import { validatePublicFantasyNewsEvents } from "./fantasy-news.mjs";

export const FANTASY_NEWS_REPOSITORY_URL = "https://raw.githubusercontent.com/RBarbieri13/Bowser/fantasy-news-data/data/fantasy-news-public.json";
const CACHE_MS = 60_000;
const MAX_BYTES = 512 * 1024;
const MAX_EVENTS = 500;
const PRIVATE_KEY = /^(?:yahoo(?:Data|Context)?|private(?:Data|Payload)?|isPrivate|league(?:Key|Id|Name)?|teamKey|roster|ownership|account|session|accessToken|refreshToken|authorization|password|credentials?)$/i;
const EVENT_KEYS = new Set(["eventId", "player", "headline", "summary", "fantasyAnalysis", "eventType", "status", "fantasyImpact", "firstReportedAt", "lastUpdatedAt", "checkedAt", "sourceQuality", "sources", "injury", "sentiment", "buzz", "affectedPlayers", "urgency"]);
const ENVELOPE_KEYS = new Set(["version", "scope", "mode", "checkedAt", "updatedAt", "revision", "contentHash", "events"]);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function repositorySnapshotHash(snapshot) {
  const { contentHash: _excluded, ...content } = snapshot;
  return createHash("sha256").update(canonical(content)).digest("hex");
}

function failure(code, message) { const error = new Error(message); error.code = code; return error; }
function iso(value, now) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate() && Number.isFinite(Date.parse(value)) && Date.parse(value) <= now;
}
function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

function privateFields(value) {
  if (Array.isArray(value)) return value.some(privateFields);
  if (!object(value)) return false;
  return Object.entries(value).some(([key, nested]) => PRIVATE_KEY.test(key) || ((key === "scope" || key === "visibility") && ["private", "personal", "yahoo", "league"].includes(nested)) || privateFields(nested));
}

function supportedKeys(value, keys) { return object(value) && Object.keys(value).every((key) => keys.has(key)); }

function strictEvent(event) {
  if (!supportedKeys(event, EVENT_KEYS)) return false;
  if (!supportedKeys(event.player, new Set(["playerId", "name", "team", "position"]))) return false;
  if (!Array.isArray(event.sources) || event.sources.length < 1 || event.sources.length > 20 || event.sources.some((source) => !supportedKeys(source, new Set(["sourceName", "author", "xHandle", "sourceType", "publishedAt", "publishedAtRaw", "publishedDate", "url", "isOriginalSource", "checkedAt", "encounteredByProvider"])))) return false;
  if (event.injury && !supportedKeys(event.injury, new Set(["isInjuryRelated", "bodyPart", "practiceStatus", "gameStatus", "expectedReturn"]))) return false;
  if (event.sourceQuality && !supportedKeys(event.sourceQuality, new Set(["confidence", "modelConfidence", "primarySourceType", "corroboratingSourceCount"]))) return false;
  if (event.sentiment && !supportedKeys(event.sentiment, new Set(["score", "direction", "expertSentiment", "beatWriterSentiment", "socialSentiment", "reason"]))) return false;
  if (event.buzz && !supportedKeys(event.buzz, new Set(["score", "direction"]))) return false;
  if (event.urgency != null && !supportedKeys(event.urgency, new Set(["score", "basis", "method", "estimatedAt"]))) return false;
  if (event.affectedPlayers != null && (!Array.isArray(event.affectedPlayers) || event.affectedPlayers.some((player) => !supportedKeys(player, new Set(["name", "relationship", "impact", "playerId", "team", "position"]))))) return false;
  return true;
}

export function validateRepositorySnapshot(snapshot, { now = Date.now() } = {}) {
  const milliseconds = now instanceof Date ? now.getTime() : now;
  if (!supportedKeys(snapshot, ENVELOPE_KEYS) || snapshot.version !== 1 || snapshot.scope !== "public_nfl_news" || snapshot.mode !== "repository_public_snapshot"
    || !iso(snapshot.checkedAt, milliseconds) || !iso(snapshot.updatedAt, milliseconds) || Date.parse(snapshot.checkedAt) > Date.parse(snapshot.updatedAt)
    || typeof snapshot.revision !== "string" || !/^[A-Za-z0-9._:-]{1,120}$/.test(snapshot.revision)
    || typeof snapshot.contentHash !== "string" || !/^[a-f0-9]{64}$/.test(snapshot.contentHash)
    || !Array.isArray(snapshot.events) || snapshot.events.length > MAX_EVENTS) throw failure("repository_invalid_schema", "The public repository snapshot has an invalid schema.");
  if (privateFields(snapshot) || snapshot.events.some((event) => !strictEvent(event))) throw failure("repository_non_public", "The repository snapshot contains unsupported or non-public record fields.");
  if (repositorySnapshotHash(snapshot) !== snapshot.contentHash) throw failure("repository_checksum_mismatch", "The public snapshot checksum does not match its content.");
  if (!validatePublicFantasyNewsEvents(snapshot.events, milliseconds)) throw failure("repository_invalid_records", "The public repository snapshot contains invalid or non-public reports.");
  if (snapshot.events.some((event) => Date.parse(event.checkedAt) > Date.parse(snapshot.checkedAt)
    || (event.urgency && Date.parse(event.urgency.estimatedAt) > Date.parse(snapshot.updatedAt))
    || event.sources.some((source) => source.checkedAt != null && Date.parse(source.checkedAt) > Date.parse(event.checkedAt)))) throw failure("repository_invalid_records", "Record checks and estimates must precede their allowed source-check and writer times.");
  return snapshot;
}

async function boundedBody(response) {
  const declared = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) throw failure("repository_too_large", "The public snapshot exceeds its size limit.");
  if (!response.body?.getReader) {
    const body = await response.text();
    if (Buffer.byteLength(body, "utf8") > MAX_BYTES) throw failure("repository_too_large", "The public snapshot exceeds its size limit.");
    return body;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) { await reader.cancel(); throw failure("repository_too_large", "The public snapshot exceeds its size limit."); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, bytes).toString("utf8");
}

export function createRepositoryFantasyNewsReader({ fetchImpl = fetch, now = Date.now } = {}) {
  let lastGood;
  let expiresAt = 0;
  let inflight;
  let lastError;
  const clock = () => typeof now === "function" ? now() : now;

  function result(cacheState) {
    if (!lastGood) return { verified: false, feed: null, sourceUrl: FANTASY_NEWS_REPOSITORY_URL, error: lastError || { code: "repository_unavailable", message: "No verified public repository snapshot is available." } };
    const payload = structuredClone(lastGood.snapshot);
    return {
      verified: true, error: lastError || null,
      feed: {
        meta: { snapshotMode: "repository_public_snapshot", total: payload.events.length, repository: {
          sourceUrl: FANTASY_NEWS_REPOSITORY_URL, revision: payload.revision, contentHash: payload.contentHash,
          checkedAt: payload.checkedAt, updatedAt: payload.updatedAt, fetchedAt: lastGood.fetchedAt,
          cacheState, lastReadState: lastError ? "unavailable" : "verified", errorCode: lastError?.code || null,
        } },
        events: payload.events,
      },
    };
  }

  async function refresh() {
    const readTime = clock();
    try {
      const headers = { Accept: "application/json, text/plain;q=0.9" };
      if (lastGood?.etag) headers["If-None-Match"] = lastGood.etag;
      const response = await fetchImpl(FANTASY_NEWS_REPOSITORY_URL, { method: "GET", headers, redirect: "error", signal: AbortSignal.timeout(5_000) });
      if (response.redirected || (response.url && response.url !== FANTASY_NEWS_REPOSITORY_URL)) throw failure("repository_redirect_rejected", "The public repository source redirected unexpectedly.");
      if (response.status === 304) {
        if (!lastGood) throw failure("repository_unexpected_not_modified", "No verified snapshot exists for this conditional response.");
        lastGood.fetchedAt = new Date(readTime).toISOString();
        lastError = null;
        return result("not_modified");
      }
      if (!response.ok) throw failure(response.status === 404 ? "repository_not_found" : "repository_unavailable", "The approved public repository snapshot is unavailable.");
      let payload;
      try { payload = JSON.parse(await boundedBody(response)); }
      catch (error) { if (error.code) throw error; throw failure("repository_invalid_json", "The public repository snapshot is not valid JSON."); }
      validateRepositorySnapshot(payload, { now: readTime });
      if (lastGood && (Date.parse(payload.updatedAt) < Date.parse(lastGood.snapshot.updatedAt)
        || (payload.contentHash !== lastGood.snapshot.contentHash && (payload.revision === lastGood.snapshot.revision || payload.updatedAt === lastGood.snapshot.updatedAt)))) throw failure("repository_revision_regression", "The repository response would replace the verified snapshot with an older or conflicting revision.");
      const etag = response.headers?.get?.("etag");
      lastGood = { snapshot: payload, fetchedAt: new Date(readTime).toISOString(), etag: typeof etag === "string" && etag.length <= 256 && !/[\r\n]/.test(etag) ? etag : null };
      lastError = null;
      return result("fetched");
    } catch (error) {
      const known = typeof error?.code === "string" && error.code.startsWith("repository_");
      lastError = { code: known ? error.code : "repository_unavailable", message: known ? error.message : "The approved public repository snapshot could not be read." };
      return result("retained_last_good");
    } finally { expiresAt = readTime + CACHE_MS; }
  }

  return async function readRepositorySnapshot() {
    if (clock() < expiresAt) return result(lastError ? "retained_last_good" : "cached");
    if (!inflight) inflight = refresh().finally(() => { inflight = null; });
    return inflight;
  };
}

const defaultReader = createRepositoryFantasyNewsReader();
export function readRepositoryFantasyNews() { return defaultReader(); }

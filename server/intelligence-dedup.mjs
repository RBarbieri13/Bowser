import { createHash } from "node:crypto";

const TRACKING = /^(utm_|fbclid$|gclid$|ref$|source$)/i;
const STOPWORDS = new Set(["a", "an", "and", "at", "for", "from", "in", "is", "of", "on", "the", "to", "with", "update", "latest"]);

export function canonicalizeSourceUrl(value) {
  const url = new URL(value);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  for (const key of [...url.searchParams.keys()]) if (TRACKING.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
  return url.toString();
}

export function xPostId(value) {
  try { return new URL(value).pathname.match(/\/status\/(\d+)/)?.[1] || null; }
  catch { return null; }
}

function tokens(value) {
  return new Set(String(value || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((token) => token.length > 1 && !STOPWORDS.has(token)));
}

function similarity(left, right) {
  const a = tokens(left); const b = tokens(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / new Set([...a, ...b]).size;
}

export function observationFingerprint({ providerId, providerItemId, url, author, publishedAt, content }) {
  if (providerItemId) return `${providerId}:id:${providerItemId}`;
  if (url) return `${providerId}:url:${canonicalizeSourceUrl(url)}`;
  const minute = new Date(publishedAt || 0).toISOString().slice(0, 16);
  return `${providerId}:hash:${createHash("sha256").update(`${author || ""}|${minute}|${content || ""}`.toLowerCase()).digest("hex")}`;
}

export function canonicalEventKey(event) {
  const player = event.player?.playerId || event.player?.name?.toLowerCase();
  const time = new Date(event.firstReportedAt || event.lastUpdatedAt || 0);
  const bucket = Number.isNaN(time.getTime()) ? "unknown" : `${time.toISOString().slice(0, 10)}-${Math.floor(time.getUTCHours() / 3)}`;
  return `${player}|${event.eventType}|${bucket}`;
}

function sourceOverlap(a, b) {
  const left = new Set((a.sources || []).map((source) => {
    try { return canonicalizeSourceUrl(source.url); } catch { return source.url; }
  }));
  return (b.sources || []).some((source) => {
    try { return left.has(canonicalizeSourceUrl(source.url)); } catch { return left.has(source.url); }
  });
}

function mergePair(existing, incoming) {
  const sources = new Map();
  for (const source of [...(existing.sources || []), ...(incoming.sources || [])]) {
    let key;
    try { key = canonicalizeSourceUrl(source.url); } catch { key = source.url; }
    sources.set(key, source);
  }
  const authority = { OFFICIAL: 6, INSIDER: 5, BEAT_WRITER: 5, FANTASY_EXPERT: 4, NEWS_OUTLET: 3, SOCIAL: 2, OTHER: 1 };
  const supplementary = (event) => (event.sources || []).length > 0 && (event.sources || []).every((source) => /RotoWire NFL RSS|FantasyCalc/i.test(source.sourceName || ""));
  const providerModifier = (name) => /32 Beat Writers|FantasyPros Player News|Sleeper Trending Players/i.test(name || "") ? 2 : 1;
  const authorityScore = (event) => Math.max(0, ...(event.sources || []).map((source) => (authority[source.sourceType] || 0) * 10 + providerModifier(source.sourceName)));
  const incomingAuthority = authorityScore(incoming);
  const existingAuthority = authorityScore(existing);
  const incomingConfidence = Number(incoming.sourceQuality?.confidence || 0);
  const existingConfidence = Number(existing.sourceQuality?.confidence || 0);
  const preferred = (!supplementary(incoming) && supplementary(existing))
    || (supplementary(incoming) === supplementary(existing) && incomingAuthority > existingAuthority)
    || (supplementary(incoming) === supplementary(existing) && incomingAuthority === existingAuthority && incomingConfidence > existingConfidence)
    || (supplementary(incoming) === supplementary(existing) && incomingAuthority === existingAuthority && incomingConfidence === existingConfidence && Date.parse(incoming.lastUpdatedAt) > Date.parse(existing.lastUpdatedAt))
    ? incoming : existing;
  return {
    ...preferred,
    eventId: existing.eventId,
    sources: [...sources.values()],
    firstReportedAt: new Date(existing.firstReportedAt) < new Date(incoming.firstReportedAt) ? existing.firstReportedAt : incoming.firstReportedAt,
    lastUpdatedAt: new Date(existing.lastUpdatedAt) > new Date(incoming.lastUpdatedAt) ? existing.lastUpdatedAt : incoming.lastUpdatedAt,
    sourceQuality: { ...preferred.sourceQuality, corroboratingSourceCount: Math.max(0, sources.size - 1) },
  };
}

export function deduplicateIntelligenceEvents(events = []) {
  const kept = [];
  const quarantine = [];
  for (const event of events.filter(Boolean).sort((a, b) => Date.parse(a.firstReportedAt) - Date.parse(b.firstReportedAt))) {
    const candidates = kept.filter((existing) => canonicalEventKey(existing) === canonicalEventKey(event));
    const exact = candidates.find((existing) => sourceOverlap(existing, event));
    const semantic = candidates.filter((existing) => similarity(`${existing.headline} ${existing.summary}`, `${event.headline} ${event.summary}`) >= 0.34);
    const match = exact || (semantic.length === 1 ? semantic[0] : null);
    if (semantic.length > 1 && !exact) { quarantine.push({ event, reason: "ambiguous_event_match" }); continue; }
    if (!match) { kept.push(event); continue; }
    kept[kept.indexOf(match)] = mergePair(match, event);
  }
  return { events: kept.sort((a, b) => Date.parse(b.lastUpdatedAt) - Date.parse(a.lastUpdatedAt)), quarantine };
}

import { readFileSync } from "node:fs";
import { queryPersistedIntelligenceFeed } from "./intelligence-store.mjs";
import { intelligenceDatabaseStatus } from "./intelligence-db.mjs";
import { liveProviderStatus } from "./intelligence-live.mjs";
import { EVENT_TYPES, EVENT_STATUSES, FANTASY_IMPACTS, SOURCE_TYPES } from "./intelligence-schema.mjs";
import { readRepositoryFantasyNews } from "./fantasy-news-repository.mjs";

export const FANTASY_NEWS_POSITIONS = ["QB", "RB", "WR", "TE"];
const STALE_AFTER_HOURS = 6;
const PROVIDERS = {
  xai: { name: "xAI X and web search", access: "mixed", news: true },
  fantasypros: { name: "FantasyPros Player News", access: "licensed", news: true },
  "32bw": { name: "32 Beat Writers", access: "licensed", news: true },
  rotowire: { name: "RotoWire NFL RSS", access: "public", news: true },
  sleeper: { name: "Sleeper Trending", access: "public", news: false },
  fantasycalc: { name: "FantasyCalc market values", access: "public", news: false },
};
const STATUS_LABELS = {
  CONFIRMED: "Confirmed report", REPORTED: "Reported", STRONG_INDICATION: "Strong indication",
  RUMOR: "Rumor", SPECULATION: "Speculation",
};
const PRIVATE_KEYS = new Set(["yahoo", "yahoodata", "yahoocontext", "privatedata", "league", "leaguekey", "teamkey", "roster", "ownership", "account", "session", "accesstoken", "refreshtoken"]);

export class FantasyNewsQueryError extends Error {
  constructor(field, message) { super(message); this.name = "FantasyNewsQueryError"; this.field = field; }
}

function text(value, maximum = 1200) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : null;
}

function timestamp(value, now) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const milliseconds = Date.parse(value);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate() || !Number.isFinite(milliseconds) || milliseconds > now) return null;
  return value;
}

function calendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  return month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate() ? value : null;
}

function dateIntervalOverlaps(date, cutoff, now) {
  if (!date || date > new Date(now).toISOString().slice(0, 10)) return false;
  // With no timezone, retain the entire calendar day across UTC+14 through UTC-12.
  const start = Date.parse(`${date}T00:00:00Z`) - 14 * 3600 * 1000;
  const end = Date.parse(`${date}T23:59:59.999Z`) + 12 * 3600 * 1000;
  return start <= now && end >= cutoff;
}

function publicUrl(value) {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (!host.includes(".") || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")
      || /^(?:127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host)
      || ["fantasysports.yahooapis.com", "api.login.yahoo.com", "football.fantasysports.yahoo.com", "fantasy.yahoo.com", "chatgpt.com", "chat.openai.com"].some((domain) => host === domain || host.endsWith(`.${domain}`))
      || /\/api\/v1\/(?:yahoo|auth)(?:\/|$)/i.test(url.pathname)) return null;
    const credentialKey = /^(?:access[_-]?token|refresh[_-]?token|id[_-]?token|oauth[_-]?(?:token|signature)|api[_-]?key|token|jwt|sig|authorization|session|password|credential|signature|code|x-amz-.+|x-goog-.+)$/i;
    if ([...url.searchParams.keys(), ...new URLSearchParams(url.hash.slice(1)).keys()].some((key) => credentialKey.test(key))) return null;
    return url.toString();
  } catch { return null; }
}

function hasPrivateMarker(event) {
  return event?.private === true || event?.isPrivate === true || ["private", "yahoo", "league", "personal"].includes(String(event?.scope || "").toLowerCase())
    || ["private", "yahoo", "personal"].includes(String(event?.visibility || "").toLowerCase())
    || Object.keys(event || {}).some((key) => PRIVATE_KEYS.has(key.toLowerCase()));
}

function sourceAccess(host, isX) {
  if (isX) return { access: "login_possible", accessLabel: "X link; login or access limits may apply" };
  if (host === "32beatwriters.com" || host.endsWith(".32beatwriters.com")) return { access: "paywall_possible", accessLabel: "Membership may be required" };
  if (host === "rotowire.com" || host.endsWith(".rotowire.com") || host === "fantasypros.com" || host.endsWith(".fantasypros.com")) return { access: "paywall_possible", accessLabel: "Public excerpt; full article access may vary" };
  if (["nfl.com", "sleeper.com", "sleeper.app", "fantasycalc.com"].some((domain) => host === domain || host.endsWith(`.${domain}`))) return { access: "public", accessLabel: "Public source" };
  return { access: "unknown", accessLabel: "Source access not verified" };
}

function projectSource(source, now, marketSignal, archive) {
  if (!source || typeof source !== "object" || hasPrivateMarker(source)) return null;
  const url = publicUrl(source.url);
  const sourceName = text(source.sourceName, 120);
  const publishedAt = timestamp(source.publishedAt, now);
  const publishedAtRaw = archive ? text(source.publishedAtRaw, 120) : null;
  const publishedDate = archive ? calendarDate(source.publishedDate) : null;
  if (publishedDate && publishedDate > new Date(now).toISOString().slice(0, 10)) return null;
  if (!url || !sourceName || !SOURCE_TYPES.includes(source.sourceType) || (source.publishedAt != null && !publishedAt) || (source.checkedAt != null && !timestamp(source.checkedAt, now)) || (!publishedAt && (!publishedAtRaw || !publishedDate))) return null;
  const host = new URL(url).hostname.toLowerCase();
  const isX = ["x.com", "twitter.com"].some((domain) => host === domain || host.endsWith(`.${domain}`));
  return {
    sourceName, author: text(source.author, 120), xHandle: text(source.xHandle, 80), sourceType: source.sourceType,
    publishedAt, publishedAtRaw, publishedDate, timestampStatus: publishedAt ? "known" : "timezone_unspecified",
    timestampBasis: marketSignal ? "observed_at" : "published_at",
    url, isOriginalSource: source.isOriginalSource === true, isX, checkedAt: archive ? timestamp(source.checkedAt, now) : null,
    ...sourceAccess(host, isX),
  };
}

function category(event) {
  if (event.eventType === "PRACTICE") return "practice";
  if (event.eventType === "INJURY" || event.eventType === "RETURN" || event.injury?.isInjuryRelated === true) return "injury";
  if (["ROLE_CHANGE", "DEPTH_CHART"].includes(event.eventType)) return "playing_time";
  return "fantasy_news";
}

function projectArticle(event, now, archive, forceStale = false) {
  if (!event || typeof event !== "object" || hasPrivateMarker(event)) return null;
  const id = text(event.eventId, 240);
  const name = text(event.player?.name, 120);
  const headline = text(event.headline, 220);
  const summary = text(event.summary, 1200);
  if (!id || !name || !headline || !summary || !FANTASY_NEWS_POSITIONS.includes(event.player?.position)
    || !EVENT_TYPES.includes(event.eventType) || !EVENT_STATUSES.includes(event.status) || !FANTASY_IMPACTS.includes(event.fantasyImpact)) return null;
  const marketSignal = /^(?:sleeper-trending-|fantasycalc-)/.test(id)
    || (Array.isArray(event.sources) && event.sources.length > 0 && event.sources.every((source) => /^(?:Sleeper Trending|FantasyCalc)$/i.test(source?.sourceName || "")));
  if (!Array.isArray(event.sources) || event.sources.length < 1 || event.sources.length > 20) return null;
  const rawSources = event.sources;
  const sources = rawSources.map((source) => projectSource(source, now, marketSignal, archive)).filter(Boolean);
  // Do not silently turn a partly malformed citation set into a cleaner-looking report.
  if (!sources.length || sources.length !== rawSources.length) return null;
  const firstReportedAt = timestamp(event.firstReportedAt, now);
  const updatedAt = timestamp(event.lastUpdatedAt, now);
  if (!archive && (!firstReportedAt || !updatedAt || Date.parse(updatedAt) < Date.parse(firstReportedAt))) return null;
  if (archive && ((event.firstReportedAt != null && !firstReportedAt) || (event.lastUpdatedAt != null && !updatedAt) || (firstReportedAt && updatedAt && Date.parse(updatedAt) < Date.parse(firstReportedAt)))) return null;
  if (archive && !timestamp(event.checkedAt, now)) return null;
  const datedSources = sources.filter((source) => source.publishedAt);
  const publishedAt = datedSources.reduce((latest, source) => !latest || Date.parse(source.publishedAt) > Date.parse(latest) ? source.publishedAt : latest, null);
  const ageSeconds = publishedAt ? Math.max(0, Math.floor((now - Date.parse(publishedAt)) / 1000)) : null;
  const primary = sources.find((source) => source.isOriginalSource) || sources[0];
  const confidence = typeof event.sourceQuality?.confidence === "number" && Number.isFinite(event.sourceQuality.confidence) && event.sourceQuality.confidence >= 0 && event.sourceQuality.confidence <= 100 ? event.sourceQuality.confidence : null;
  const kind = marketSignal ? "market_signal" : event.status === "RUMOR" ? "rumor" : event.status === "SPECULATION" ? "speculation"
    : event.status === "CONFIRMED" && sources.some((source) => source.sourceType === "OFFICIAL") ? "official_report" : "report";
  return {
    id, headline, summary, fantasyAnalysis: text(event.fantasyAnalysis, 900),
    category: category(event), categories: [category(event)], eventType: event.eventType, status: event.status, fantasyImpact: event.fantasyImpact,
    players: [{ playerId: text(event.player.playerId, 120), name, team: text(event.player.team, 5) || "UNK", position: event.player.position }],
    source: primary.sourceName, url: primary.url, sources,
    publishedAt, publishedAtRaw: !publishedAt ? primary.publishedAtRaw : null,
    publishedDate: !publishedAt ? primary.publishedDate : null,
    timestampStatus: publishedAt ? "known" : "timezone_unspecified", timestampBasis: marketSignal ? "observed_at" : "published_at",
    firstReportedAt, updatedAt, capturedAt: null,
    checkedAt: archive ? timestamp(event.checkedAt, now) : null,
    evidence: { kind, label: marketSignal ? "Market signal; does not confirm football news" : STATUS_LABELS[event.status], status: event.status, confidence },
    freshness: { state: forceStale || ageSeconds === null || ageSeconds > STALE_AFTER_HOURS * 3600 ? "stale" : "current", ageSeconds },
    injury: {
      isInjuryRelated: event.injury?.isInjuryRelated === true,
      bodyPart: text(event.injury?.bodyPart, 120), practiceStatus: text(event.injury?.practiceStatus, 120),
      gameStatus: text(event.injury?.gameStatus, 120), expectedReturn: text(event.injury?.expectedReturn, 120),
    },
  };
}

export function validatePublicFantasyNewsEvents(events, now = Date.now()) {
  if (!Array.isArray(events) || events.length > 500) return false;
  const ids = new Set();
  for (const event of events) {
    const article = projectArticle(event, now, true);
    if (!article || ids.has(article.id)) return false;
    ids.add(article.id);
  }
  return true;
}

function list(params, key, allowed) {
  const values = [...new Set(String(params.get(key) || "").split(",").map((value) => value.trim().toUpperCase()).filter(Boolean))];
  const invalid = values.find((value) => !allowed.includes(value));
  if (invalid) throw new FantasyNewsQueryError(key, `Unsupported ${key}: ${invalid}`);
  return values;
}

function integer(params, key, fallback, minimum, maximum) {
  if (!params.has(key)) return fallback;
  const value = Number(params.get(key));
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new FantasyNewsQueryError(key, `${key} must be an integer from ${minimum} to ${maximum}`);
  return value;
}

function query(params) {
  if (params.has("live")) throw new FantasyNewsQueryError("live", "This endpoint reads public snapshots. Live refresh uses the existing operator-authorized intelligence-runs endpoint.");
  const teams = String(params.get("team") || "").split(",").map((value) => value.trim().toUpperCase()).filter(Boolean);
  if (teams.some((team) => !/^[A-Z]{2,5}$/.test(team))) throw new FantasyNewsQueryError("team", "team must contain NFL team abbreviations");
  return {
    positions: list(params, "position", FANTASY_NEWS_POSITIONS), statuses: list(params, "status", EVENT_STATUSES),
    impacts: list(params, "impact", FANTASY_IMPACTS), eventTypes: list(params, "eventType", EVENT_TYPES), teams,
    hours: integer(params, "hours", 168, 1, 720), limit: integer(params, "limit", 100, 1, 100),
    search: String(params.get("search") || "").trim().toLowerCase().slice(0, 100),
  };
}

function publicProviders(status) {
  return Object.entries(PROVIDERS).map(([id, provider]) => {
    const ready = status?.sources?.[id]?.ready ?? status?.sources?.[id]?.configured ?? false;
    return { id, ...provider, ready: ready === true, coverage: "not_verified", message: ready ? "Adapter enabled; source coverage has not been independently verified." : "Adapter unavailable under the existing configuration." };
  });
}

function response(feed, filter, options) {
  const { now, status, database, tokenConfigured, readFailure } = options;
  const archive = feed?.meta?.snapshotMode === "archived_public_baseline";
  const durable = feed?.meta?.snapshotMode === "durable_active_snapshot";
  const repository = feed?.meta?.snapshotMode === "repository_public_snapshot";
  const acceptedSnapshot = durable || archive || repository;
  const raw = acceptedSnapshot && Array.isArray(feed?.events) ? feed.events : [];
  const validById = new Map();
  for (const event of raw) {
    const article = projectArticle(event, now, archive || repository, archive);
    if (!article) continue;
    const previous = validById.get(article.id);
    if (!previous || Date.parse(article.publishedAt || article.publishedDate) > Date.parse(previous.publishedAt || previous.publishedDate)) validById.set(article.id, article);
  }
  const valid = [...validById.values()];
  const discarded = raw.length - valid.length;
  const cutoff = now - filter.hours * 3600 * 1000;
  const matching = valid.filter((article) => {
    const player = article.players[0];
    if (article.publishedAt ? Date.parse(article.publishedAt) < cutoff : !(archive || repository) || !dateIntervalOverlaps(article.publishedDate, cutoff, now)) return false;
    return (!filter.positions.length || filter.positions.includes(player.position))
      && (!filter.teams.length || filter.teams.includes(player.team))
      && (!filter.statuses.length || filter.statuses.includes(article.status))
      && (!filter.impacts.length || filter.impacts.includes(article.fantasyImpact))
      && (!filter.eventTypes.length || filter.eventTypes.includes(article.eventType))
      && (!filter.search || [player.name, player.team, article.headline, article.summary, article.fantasyAnalysis].filter(Boolean).join(" ").toLowerCase().includes(filter.search));
  }).sort((a, b) => (b.publishedAt ? Date.parse(b.publishedAt) : Date.parse(`${b.publishedDate}T00:00:00Z`)) - (a.publishedAt ? Date.parse(a.publishedAt) : Date.parse(`${a.publishedDate}T00:00:00Z`)) || a.id.localeCompare(b.id));
  const articles = matching.slice(0, filter.limit);
  const latestSourcePublishedAt = valid.reduce((latest, article) => article.publishedAt && (!latest || Date.parse(article.publishedAt) > Date.parse(latest)) ? article.publishedAt : latest, null);
  const latestEventUpdatedAt = valid.reduce((latest, article) => article.updatedAt && (!latest || Date.parse(article.updatedAt) > Date.parse(latest)) ? article.updatedAt : latest, null);
  const ageSeconds = latestSourcePublishedAt ? Math.max(0, Math.floor((now - Date.parse(latestSourcePublishedAt)) / 1000)) : null;
  const sourceCheckedAt = repository ? timestamp(feed.meta.repository?.checkedAt, now) : null;
  const sourceCheckAgeSeconds = sourceCheckedAt ? Math.max(0, Math.floor((now - Date.parse(sourceCheckedAt)) / 1000)) : null;
  const repositoryOutage = repository && feed.meta.repository?.lastReadState !== "verified";
  const incompleteRead = typeof feed?.meta?.total === "number" && feed.meta.total > raw.length;
  const state = readFailure || !acceptedSnapshot || (raw.length > 0 && !valid.length) ? "unavailable"
    : archive || repositoryOutage || (repository ? sourceCheckAgeSeconds === null || sourceCheckAgeSeconds > STALE_AFTER_HOURS * 3600 : ageSeconds !== null && ageSeconds > STALE_AFTER_HOURS * 3600) ? "stale"
      : discarded || incompleteRead ? "partial" : !matching.length ? "empty" : "current";
  const sources = publicProviders(status);
  const byPosition = Object.fromEntries(FANTASY_NEWS_POSITIONS.map((position) => [position, matching.filter((article) => article.players[0].position === position).length]));
  const limitations = [
    "Enabled adapters are not evidence of complete NFL or beat-writer coverage.",
    "X search is bounded provider discovery, not a complete stream of X posts; login, deleted posts and provider limits may hide reports.",
    "Paid sources remain gated by their existing authorization and configuration; public excerpts do not grant full article access.",
    "Sleeper and FantasyCalc are market signals and do not confirm injuries, practice participation or playing time.",
    "Source publication or observation time is separate from polling time. Article receipt times and unattended scheduler execution are not verified by this public read.",
  ];
  if (discarded) limitations.push(`${discarded} malformed, duplicate or non-public record${discarded === 1 ? " was" : "s were"} excluded.`);
  if (incompleteRead) limitations.push("The upstream public read is bounded to 100 records; this response does not establish exhaustive coverage.");
  if (archive || repository) limitations.push("Unknown publication clocks/timezones are included when their possible calendar-date interval across UTC+14 through UTC-12 overlaps the requested window. These dates may fall outside the exact requested hours; exact-hour inclusion and publication age cannot be established. Future calendar dates are excluded.");
  if (archive) limitations.push("This is a sourced public archive, not a live ingestion result.");
  if (repository) limitations.push("Git stores the public snapshot. Server memory is a bounded disposable read cache. Source-check time and writer time do not establish source publication time.");
  if (repositoryOutage) limitations.push("The repository read failed; the previously verified public snapshot is retained and marked stale.");
  let message = state === "unavailable" ? "Current public news is unavailable. No verified durable public snapshot is available."
    : state === "stale" ? "Public source reports are stale; verify the original reporting before a lineup decision."
      : state === "partial" ? "A partial public snapshot is available; consult source and coverage limits."
        : state === "empty" ? "No sourced public reports match this exact time window and filters." : "Recent public source observations are available; coverage remains bounded.";
  if (readFailure) message = "Public news storage could not be read. No fallback reports were substituted.";
  if (archive) message = "Archived public reporting only. Unattended ingestion is unavailable; verify the original sources for current status.";
  if (repository && state === "current") message = "Public sources were checked recently. Publication clocks and bounded coverage remain separately labeled.";
  if (repositoryOutage) message = "Public repository refresh is unavailable. The last verified snapshot is retained and marked stale.";
  const repositoryMeta = repository ? {
    sourceUrl: publicUrl(feed.meta.repository?.sourceUrl), revision: text(feed.meta.repository?.revision, 120), contentHash: text(feed.meta.repository?.contentHash, 64),
    checkedAt: sourceCheckedAt, updatedAt: timestamp(feed.meta.repository?.updatedAt, now), fetchedAt: timestamp(feed.meta.repository?.fetchedAt, now),
    cacheState: text(feed.meta.repository?.cacheState, 40), lastReadState: text(feed.meta.repository?.lastReadState, 40),
    errorCode: text(feed.meta.repository?.errorCode, 80),
  } : options.repositoryUnavailable ? { sourceUrl: publicUrl(options.repositoryUnavailable.sourceUrl), lastReadState: "unavailable", errorCode: text(options.repositoryUnavailable.error?.code, 80) } : null;
  return {
    meta: {
      version: 1, scope: "public_nfl_news", readAt: new Date(now).toISOString(), live: false,
      snapshotMode: acceptedSnapshot ? feed.meta.snapshotMode : "unavailable", state, message,
      lookbackHours: filter.hours, timeFilterBasis: archive || repository ? "exact_timestamps_and_overlapping_calendar_dates" : "exact_source_timestamps", total: matching.length, returned: articles.length, discarded,
      refresh: {
        readPollSeconds: 60, ingestionEndpoint: "/api/v1/intelligence-runs", requiredAuthorization: "operator_bearer_token",
        persistence: repository ? "public_git_repository" : archive ? "static_public_archive" : "existing_intelligence_database",
        ready: database.ready === true && tokenConfigured && sources.some((source) => source.ready),
        durableStorageReady: database.ready === true, tokenConfigured, schedulerVerified: false,
        lastSuccessfulRunAt: null, lastAttemptAt: null,
      },
      freshness: { staleAfterHours: STALE_AFTER_HOURS, basis: repository ? "source_check" : "source_publication_or_observation", latestSourcePublishedAt, latestEventUpdatedAt, ageSeconds, sourceCheckedAt, sourceCheckAgeSeconds },
      repository: repositoryMeta,
      coverage: { positions: [...FANTASY_NEWS_POSITIONS], byPosition, complete: false, loaded: raw.length, valid: valid.length, undated: valid.filter((article) => !article.publishedAt).length, limitations },
      sources,
      methodology: {
        evidence: "Provider reporting status and source-authority confidence describe evidence, not certainty or a calibrated injury probability.",
        fantasyAnalysis: "Generic source analysis; league ownership and personalized decisions are private browser context.",
        freshness: "Six-hour freshness uses the latest accepted source publication/observation, never the public read time or event edit time.",
        privacy: "Public NFL reports only; no Yahoo accounts, leagues, rosters or private Page content.",
      },
    },
    articles,
  };
}

export function projectFantasyNewsFeed(feed, params = new URLSearchParams(), options = {}) {
  const now = options.now instanceof Date ? options.now.getTime() : options.now ?? Date.now();
  if (!Number.isFinite(now)) throw new TypeError("A valid read time is required");
  return response(feed, query(params), {
    now, status: options.providerStatus || liveProviderStatus(), database: options.databaseStatus || intelligenceDatabaseStatus(),
    tokenConfigured: options.refreshTokenConfigured ?? Boolean(process.env.INTELLIGENCE_REFRESH_TOKEN), readFailure: options.readFailure === true, repositoryUnavailable: options.repositoryUnavailable,
  });
}

export async function queryFantasyNews(params = new URLSearchParams(), options = {}) {
  query(params); // Reject invalid requests before any storage read.
  let feed;
  let readFailure = false;
  let repositoryUnavailable;
  if (options.readRepository !== false) {
    try {
      const result = await (options.readRepository || readRepositoryFantasyNews)();
      if (result.verified && result.feed) return projectFantasyNewsFeed(result.feed, params, options);
      repositoryUnavailable = result;
    } catch { repositoryUnavailable = { error: { code: "repository_unavailable" } }; }
  }
  try {
    feed = await (options.readFeed || queryPersistedIntelligenceFeed)(new URLSearchParams({ hours: "720", limit: "100" }));
  } catch { readFailure = true; }
  // Only a separately verified, explicitly public archive may be supplied here.
  if (!readFailure && feed?.meta?.snapshotMode !== "durable_active_snapshot") {
    const baseline = options.baseline === undefined ? readPublicBaseline() : options.baseline;
    if (baseline) feed = baseline;
  }
  return projectFantasyNewsFeed(feed, params, { ...options, readFailure, repositoryUnavailable });
}

function readPublicBaseline() {
  try {
    const baseline = JSON.parse(readFileSync(new URL("../data/fantasy-news-baseline.json", import.meta.url), "utf8"));
    if (baseline?.version !== 1 || baseline?.scope !== "public_nfl_news" || baseline?.mode !== "archived_public_baseline" || !Array.isArray(baseline.events)) return null;
    return { meta: { snapshotMode: baseline.mode }, events: baseline.events };
  } catch { return null; }
}

function sendJson(response, status, payload) {
  if (typeof response.status === "function" && typeof response.json === "function") return response.status(status).json(payload);
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  return response.end(JSON.stringify(payload));
}

export async function fantasyNewsHandler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return sendJson(response, 405, { error: { code: "read_only", message: "Public fantasy news is read-only." } });
  }
  try {
    const url = new URL(request.url, "https://local.invalid");
    return sendJson(response, 200, await queryFantasyNews(url.searchParams));
  } catch (error) {
    if (error instanceof FantasyNewsQueryError) return sendJson(response, 400, { error: { code: "invalid_query", field: error.field, message: error.message } });
    return sendJson(response, 500, { error: { code: "fantasy_news_error", message: "Unable to read public fantasy news." } });
  }
}

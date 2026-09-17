import { readFileSync, existsSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const historical = JSON.parse(readFileSync(new URL('../data/dfs-week1-2026.json', import.meta.url), 'utf8'));
const weeklyPath = new URL('../data/dfs-weekly.json', import.meta.url);
const archivePath = new URL('../data/dfs_archive.sqlite', import.meta.url);
let archiveCache = null;

function archiveSignature() {
  if (!existsSync(archivePath)) return null;
  const stat = statSync(archivePath);
  return `${stat.ino}:${stat.size}:${stat.mtimeMs}`;
}

function withArchive(callback) {
  if (!existsSync(archivePath)) return null;
  let db;
  try { db = new DatabaseSync(archivePath, { readOnly: true }); return callback(db); }
  catch { return null; } // Independently verified JSON snapshots remain available if an archive cannot be read.
  finally { db?.close(); }
}

function archiveSlates() {
  const signature = archiveSignature();
  if (archiveCache?.signature === signature) return archiveCache.slates;
  const slates = withArchive(db => Object.fromEntries(db.prepare(`
    SELECT * FROM (SELECT *, ROW_NUMBER() OVER (
      PARTITION BY season,week,slate_id ORDER BY captured_at DESC,capture_id DESC
    ) AS version_order FROM dfs_captures) WHERE version_order=1
  `).all().map(row => {
    const meta = JSON.parse(row.metadata_json);
    const records = db.prepare('SELECT record_json FROM dfs_prices WHERE capture_id=? ORDER BY rowid').all(row.capture_id)
      .map(r => JSON.parse(r.record_json));
    return [row.slate_key, { ...meta, records }];
  }))) || {};
  archiveCache = {signature,slates,index:null};
  return slates;
}

export function getDfsArchiveIndex() {
  archiveSlates();
  if (archiveCache.index) return archiveCache.index;
  const index = withArchive(db => db.prepare(`SELECT season,week,slate_id AS slateId,slate_key AS key,
    capture_id AS captureId,captured_at AS capturedAt,game_count AS gameCount,
    (SELECT COUNT(*) FROM dfs_prices p WHERE p.capture_id=c.capture_id) AS salaryPlayers,
    (SELECT COUNT(*) FROM dfs_prices p WHERE p.capture_id=c.capture_id AND projection IS NOT NULL) AS projectedPlayers
    FROM dfs_captures c ORDER BY season DESC,week DESC,captured_at DESC,game_count DESC`).all()) || [];
  archiveCache.index = index;
  return index;
}

function readWeekly() {
  if (!existsSync(weeklyPath)) return null;
  try {
    const data = JSON.parse(readFileSync(weeklyPath, 'utf8'));
    if (data.schemaVersion !== 2 || data.validation?.status !== 'verified' || !data.slates?.[data.defaultSlate]) return null;
    if (Object.values(data.slates).some(s => s.validation?.status !== 'verified' || !Array.isArray(s.records))) return null;
    return data;
  } catch {
    // A missing/corrupt update must never hide the last shipped historical data.
    return null;
  }
}

export function getDfsSlate(key = 'current') {
  const weekly = readWeekly();
  const slates = { ...historical.slates, ...(weekly?.slates || {}), ...archiveSlates() };
  const defaultKey = weekly?.defaultSlate || historical.defaultSlate;
  const requestedKey = key || 'current';
  const resolvedKey = requestedKey === 'current' ? defaultKey : requestedKey;
  if (!Object.hasOwn(slates, resolvedKey)) return null;
  const { records, ...meta } = slates[resolvedKey];
  const now = Date.now();
  const ended = new Date(meta.endsAt).getTime() + 4 * 60 * 60 * 1000 < now;
  const fallback = requestedKey === 'current' && (!weekly || ended);
  const options = [
    { key: 'current', label: `Current · ${slates[defaultKey].label}`, season: slates[defaultKey].season,
      week: slates[defaultKey].week, startsAt: slates[defaultKey].startsAt, endsAt: slates[defaultKey].endsAt },
    ...Object.entries(slates).sort(([, a], [, b]) => b.season - a.season || b.week - a.week || b.gameCount - a.gameCount)
      .map(([key, s]) => ({ key, label: s.label, season: s.season, week: s.week, startsAt: s.startsAt, endsAt: s.endsAt })),
  ];
  return {
    meta: { ...meta, key: resolvedKey, requestedKey, defaultSlate: defaultKey, options,
      availability: fallback ? 'last-good' : ended ? 'archived' : 'available',
      currentSnapshotAvailable: Boolean(weekly) && !ended,
      availabilityMessage: fallback ? `Showing last verified ${meta.season} Week ${meta.week} data; a newer verified slate is not available.` : null },
    records: records.filter(row => row.playerId),
  };
}

// Exact historical lookup: a missing week is never substituted with the current slate.
export function getDfsWeek(season, week, { slateId, captureId } = {}) {
  const index = getDfsArchiveIndex().filter(s => s.season === season && s.week === week
    && (!slateId || s.slateId === Number(slateId)) && (!captureId || s.captureId === captureId));
  const choice = index.toSorted((a,b) => b.gameCount-a.gameCount || b.capturedAt.localeCompare(a.capturedAt) || a.slateId-b.slateId)[0];
  if (choice) {
    const cached = archiveCache.slates[choice.key];
    if (cached?.captureId === choice.captureId) {
      const { records,...meta } = cached;
      return {records:records.filter(r => r.playerId),meta:{...meta,key:choice.key,availability:'archived',selection:'exact-week',referenceSeason:season,referenceWeek:week,available:true,reason:null}};
    }
    const result = withArchive(db => {
    const capture = db.prepare('SELECT metadata_json FROM dfs_captures WHERE capture_id=?').get(choice.captureId);
    const records = db.prepare('SELECT record_json FROM dfs_prices WHERE capture_id=? AND player_id IS NOT NULL').all(choice.captureId).map(r => JSON.parse(r.record_json));
    return { records, meta: { ...JSON.parse(capture.metadata_json), key: choice.key, availability: 'archived',
      selection: 'exact-week', referenceSeason: season, referenceWeek: week, available: true, reason: null } };
    });
    if (result) return result;
  }
  if (!captureId) {
    const slates = { ...historical.slates, ...(readWeekly()?.slates || {}) };
    const entry = Object.entries(slates).filter(([,s]) => s.season === season && s.week === week && (!slateId || s.id === Number(slateId)))
      .sort(([,a],[,b]) => b.gameCount-a.gameCount || b.capturedAt.localeCompare(a.capturedAt) || a.id-b.id)[0];
    if (entry) {
      const { records,...meta } = entry[1];
      return { records: records.filter(r => r.playerId), meta: { ...meta,key:entry[0],availability:'archived',selection:'exact-week',referenceSeason:season,referenceWeek:week,available:true,reason:null } };
    }
  }
  return { records: [], meta: { season, week, referenceSeason:season,referenceWeek:week,selection:'exact-week',
    availability:'unavailable',available:false,reason:`No verified DraftKings Classic salary/projection capture is archived for ${season} Week ${week}.`,
    coverage:{salaryPlayers:0,projectedPlayers:0} } };
}

export function dfsPlayerFields(slate, playerId) {
  const row = slate.records.find(r => r.playerId === playerId);
  return { draft_kings_price: row?.salary ?? null, draft_kings_projection: row?.projection ?? null,
    dfs_meta: { season: slate.meta.season, week: slate.meta.week, slateId: slate.meta.id ?? null,
      slateKey: slate.meta.key ?? null, label: slate.meta.label ?? null, captureId: slate.meta.captureId ?? null,
      capturedAt: slate.meta.capturedAt ?? null, salarySource: slate.meta.salarySource ?? null, salaryUrl: slate.meta.salaryUrl ?? null,
      projectionSource: row?.projectionSource ?? null, projectionUrl: row?.projectionUrl ?? null,
      projectionSourceDate: row?.projectionSourceDate ?? null, game: row?.game ?? null,
      projectionCapturedAt: row?.projectionCapturedAt ?? slate.meta.capturedAt ?? null,
      salaryAvailable: Number.isFinite(row?.salary), projectionAvailable: Number.isFinite(row?.projection),
      salaryUnavailableReason: row ? null : slate.meta.reason || 'Player has no unambiguous salary identity in this slate.',
      projectionUnavailableReason: Number.isFinite(row?.projection) ? null : row?.projectionUnavailableReason || slate.meta.reason || 'No verified provider projection for this player and slate.',
      availability: slate.meta.availability, selection: slate.meta.selection ?? slate.meta.requestedKey ?? 'current' } };
}

import { readFileSync, existsSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const historical = JSON.parse(readFileSync(new URL('../data/dfs-week1-2026.json', import.meta.url), 'utf8'));
const weeklyPath = new URL('../data/dfs-weekly.json', import.meta.url);
const archivePath = new URL('../data/dfs_archive.sqlite', import.meta.url);
let archiveCache = null;
let weeklyCache = null;

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
  const slates = withArchive(db => {
    const hasHeads = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='dfs_slate_heads'").get();
    const query = hasHeads ? 'SELECT c.*,h.observed_at FROM dfs_slate_heads h JOIN dfs_captures c USING(capture_id)' : `SELECT * FROM (SELECT *,ROW_NUMBER() OVER(PARTITION BY season,week,slate_id ORDER BY captured_at DESC,capture_id DESC) AS version_order FROM dfs_captures) WHERE version_order=1`;
    return Object.fromEntries(db.prepare(query).all().map(row => {
      const meta=JSON.parse(row.metadata_json);
      return [row.slate_key,{...meta,lastObservedAt:row.observed_at || row.captured_at}];
    }));
  }) || {};
  archiveCache = {signature,slates,index:null,records:new Map()};
  return slates;
}

// Loading the slate menu must not parse every historical salary record.
function archivedSlate(key) {
  const meta = archiveSlates()[key];
  if (!meta) return null;
  let records = archiveCache.records.get(meta.captureId);
  if (!records) {
    records = withArchive(db => db.prepare('SELECT record_json FROM dfs_prices WHERE capture_id=? ORDER BY rowid')
      .all(meta.captureId).map(row => JSON.parse(row.record_json)));
    if (!records) return null;
    archiveCache.records.set(meta.captureId, records);
  }
  return { ...meta, records };
}

export function getDfsArchiveIndex() {
  archiveSlates();
  if (archiveCache.index) return archiveCache.index;
  const index = withArchive(db => db.prepare(`SELECT season,week,slate_id AS slateId,slate_key AS key,
    capture_id AS captureId,captured_at AS capturedAt,game_count AS gameCount,
    json_extract(metadata_json,'$.scoring') AS scoring,
    (SELECT COUNT(*) FROM dfs_prices p WHERE p.capture_id=c.capture_id) AS salaryPlayers,
    (SELECT COUNT(*) FROM dfs_prices p WHERE p.capture_id=c.capture_id AND projection IS NOT NULL) AS projectedPlayers
    FROM dfs_captures c ORDER BY season DESC,week DESC,captured_at DESC,game_count DESC`).all()) || [];
  archiveCache.index = index;
  return index;
}

function readWeekly() {
  if (!existsSync(weeklyPath)) return null;
  try {
    // Historical profiles request many weeks; parse an unchanged snapshot once.
    // Atomic importer replacements change the inode even when size/time match.
    const stat = statSync(weeklyPath);
    const signature = `${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
    if (weeklyCache?.signature === signature) return weeklyCache.data;
    const data = JSON.parse(readFileSync(weeklyPath, 'utf8'));
    if (data.schemaVersion !== 2 || data.validation?.status !== 'verified' || !data.slates?.[data.defaultSlate]) return null;
    if (Object.values(data.slates).some(s => s.validation?.status !== 'verified' || !Array.isArray(s.records))) return null;
    weeklyCache = { signature, data };
    return data;
  } catch {
    // A missing/corrupt update must never hide the last shipped historical data.
    return null;
  }
}

function selectRosterRole(slate, requestedRole) {
  const showdown = slate.meta.contestTypeId === 96;
  if (!showdown) return slate;
  const role = requestedRole || 'FLEX';
  if (!['FLEX','CPT'].includes(role)) return null;
  const records = slate.records.filter(row => row.rosterPosition === role);
  return { records, meta: {...slate.meta, rosterPosition:role, label:`${slate.meta.label} · ${role}`,
    rosterPositions:['FLEX','CPT'], projectionMultiplier:role === 'CPT' ? 1.5 : 1,
    projectionBasis:`Full-game DraftKings source projection${role === 'CPT' ? ' × 1.5 Captain multiplier' : '; unscaled FLEX scoring'}. Official ${role} salary.${slate.meta.projectionStatus ? ` ${slate.meta.projectionBasis || ''}` : ''}`,
    coverage:{...slate.meta.coverage,salaryEntries:slate.meta.coverage.salaryPlayers,
      salaryPlayers:slate.meta.coverage.distinctSalaryPlayers,
      projectedPlayers:slate.meta.coverage.projectedPlayers/2,
      databasePlayersWithSalary:slate.meta.coverage.databasePlayersWithSalary/2,
      databasePlayersWithProjection:slate.meta.coverage.databasePlayersWithProjection/2,
      rosterPlayersWithSalary:slate.meta.coverage.rosterPlayersWithSalary/2,
      unmatchedSalaryPlayers:slate.meta.coverage.unmatchedSalaryPlayers/2} } };
}

export function dfsSlateTiming(meta, now = Date.now()) {
  const lockAt = new Date(meta.startsAt).getTime();
  const lastStart = new Date(meta.endsAt).getTime();
  const archiveAfter = lastStart + 4 * 60 * 60 * 1000;
  const upcoming = Number.isFinite(lockAt) && now < lockAt;
  const archived = Number.isFinite(archiveAfter) && now >= archiveAfter;
  const activeGame = (meta.games || [{startsAt:meta.startsAt}]).some(game => {
    const start = new Date(game.startsAt).getTime();
    return now >= start && now < start + 4 * 60 * 60 * 1000;
  });
  return {slateState: upcoming ? 'upcoming' : archived ? 'archived' : activeGame ? 'in-progress' : 'locked',
    lockAt:meta.startsAt, archiveAfter:Number.isFinite(archiveAfter) ? new Date(archiveAfter).toISOString() : null,
    archiveTimeBasis:'Last scheduled kickoff plus four hours; not a verified game completion time.',
    isLocked:!upcoming, availability:upcoming ? 'available' : archived ? 'archived' : 'locked'};
}

function resolveDfsSlate(key = 'current', { includeUnmatched = false, lineupPool = false } = {}) {
  const weekly = readWeekly();
  const slates = { ...historical.slates, ...(weekly?.slates || {}), ...archiveSlates() };
  const now = Date.now();
  const unlocked = Object.entries(weekly?.slates || {}).filter(([,s]) => s.season === weekly.season && s.week === weekly.week
    && s.contestTypeId !== 96 && dfsSlateTiming(s,now).slateState === 'upcoming')
    .sort(([,a],[,b]) => b.gameCount-a.gameCount || a.id-b.id);
  const defaultKey = unlocked[0]?.[0] || weekly?.defaultSlate || historical.defaultSlate;
  const requestedKey = key || 'current';
  const isCaptain = requestedKey.endsWith(':cpt');
  const resolvedKey = requestedKey === 'current' ? defaultKey : isCaptain ? requestedKey.slice(0,-4) : requestedKey;
  if (!Object.hasOwn(slates, resolvedKey)) return null;
  const selected = archivedSlate(resolvedKey) || weekly?.slates?.[resolvedKey] || historical.slates[resolvedKey];
  if (!selected) return null;
  const { records, ...meta } = selected;
  if (isCaptain && meta.contestTypeId !== 96) return null;
  const timing = dfsSlateTiming(meta,now);
  const fallback = requestedKey === 'current' && (!weekly || timing.isLocked);
  const stateMessage = timing.isLocked
    ? `Slate locked at ${meta.startsAt}. Retained pregame salary/projection capture for historical review and local drafts. ${timing.slateState === 'in-progress' ? 'A scheduled game is within its four-hour kickoff window.' : timing.slateState === 'archived' ? 'Last scheduled kickoff plus four hours has elapsed.' : 'Later games may remain upcoming, but this slate has already started.'}`
    : null;
  const partialProjectionMessage = meta.projectionStatus?.refreshMode === 'allow-partial-projections'
    ? `Official DraftKings salaries verified. Fantasy Info Central projections unavailable: ${meta.primaryProjectionStatus?.reason || meta.projectionStatus.reason}. ${meta.projectionStatus.projectedPlayers} supplemental projection entries; ${meta.projectionStatus.missingPlayers} unavailable. Fantasy Sports Central publication time is unknown; capture times are observations.`
    : null;
  const options = [
    { key: 'current', label: `Current · ${slates[defaultKey].label}`, season: slates[defaultKey].season,
      week: slates[defaultKey].week, startsAt: slates[defaultKey].startsAt, endsAt: slates[defaultKey].endsAt, scoring:slates[defaultKey].scoring,
      ...dfsSlateTiming(slates[defaultKey],now) },
    ...Object.entries(slates).sort(([, a], [, b]) => b.season - a.season || b.week - a.week || b.gameCount - a.gameCount || a.startsAt.localeCompare(b.startsAt))
      .flatMap(([key, s]) => (s.contestTypeId === 96 ? ['FLEX','CPT'] : [null]).map(role => ({key:role === 'CPT' ? `${key}:cpt` : key,
        label:s.label + (role ? ` · ${role}` : '') + (dfsSlateTiming(s,now).isLocked ? ` · ${dfsSlateTiming(s,now).slateState}` : ''), season:s.season,week:s.week,startsAt:s.startsAt,endsAt:s.endsAt,
        scoring:s.scoring,rosterPosition:role,contestTypeId:s.contestTypeId,...dfsSlateTiming(s,now)}))),
  ];
  const payload = {
    meta: { ...meta, key: resolvedKey, requestedKey, defaultSlate: defaultKey, options,
      ...timing, availability: fallback ? 'last-good' : timing.availability,
      currentSnapshotAvailable: Boolean(weekly) && !timing.isLocked,
      availabilityMessage: [fallback ? `Showing last verified ${meta.season} Week ${meta.week} data; a newer verified unlocked slate is not available.` : null, stateMessage, partialProjectionMessage].filter(Boolean).join(' ') || null },
    records: includeUnmatched ? records : records.filter(row => row.playerId),
  };
  if (lineupPool && meta.contestTypeId === 96) {
    return {
      ...payload,
      meta: {
        ...payload.meta,
        rosterPositions: ['FLEX', 'CPT'],
        label: payload.meta.label.replace(/\s·\s(?:FLEX|CPT)$/, ''),
        projectionBasis: 'Full-game DraftKings source projections; Captain rows use official CPT salary and a 1.5 projection multiplier while FLEX rows remain unscaled.' + (meta.projectionStatus ? ` ${meta.projectionBasis || ''}` : ''),
      },
    };
  }
  return selectRosterRole(payload, isCaptain ? 'CPT' : 'FLEX');
}

export function getDfsSlate(key = 'current') {
  return resolveDfsSlate(key, { includeUnmatched: false });
}

export function getDfsLineupSlate(key = 'current', captureId = null) {
  const head = resolveDfsSlate(key, { includeUnmatched: true, lineupPool: true });
  if (!head) return null;
  const captures = getDfsArchiveIndex().filter(row => row.key === head.meta.key);
  if (!captureId || captureId === head.meta.captureId) return {...head,meta:{...head.meta,captures}};
  const prior = withArchive(db => {
    const row = db.prepare('SELECT metadata_json,slate_key FROM dfs_captures WHERE capture_id=?').get(captureId);
    if (!row || row.slate_key !== head.meta.key) return null;
    const metadata = JSON.parse(row.metadata_json);
    const records = db.prepare('SELECT record_json FROM dfs_prices WHERE capture_id=? ORDER BY rowid').all(captureId).map(row=>JSON.parse(row.record_json));
    return {records,meta:{...head.meta,...metadata,key:row.slate_key,captureId,captures,availability:'archived',currentSnapshotAvailable:false,availabilityMessage:'Historical capture selected. Saved lineup prices are fixed to this capture.'}};
  });
  return prior;
}

// Exact historical lookup: a missing week is never substituted with the current slate.
export function getDfsWeek(season, week, { slateId, captureId, rosterPosition = 'FLEX' } = {}) {
  const active = archiveSlates();
  const index = getDfsArchiveIndex().filter(s => (captureId || active[s.key]?.captureId === s.captureId) && s.season === season && s.week === week
    && (slateId || captureId || s.scoring === 'DraftKings Classic') && (!slateId || s.slateId === Number(slateId)) && (!captureId || s.captureId === captureId));
  const choice = index.toSorted((a,b) => b.gameCount-a.gameCount || b.capturedAt.localeCompare(a.capturedAt) || a.slateId-b.slateId)[0];
  if (choice) {
    const cached = active[choice.key]?.captureId === choice.captureId ? archivedSlate(choice.key) : null;
    if (cached?.captureId === choice.captureId) {
      const { records,...meta } = cached;
      return selectRosterRole({records:records.filter(r => r.playerId),meta:{...meta,key:choice.key,availability:'archived',selection:'exact-week',referenceSeason:season,referenceWeek:week,available:true,reason:null}},rosterPosition);
    }
    const result = withArchive(db => {
    const capture = db.prepare('SELECT metadata_json FROM dfs_captures WHERE capture_id=?').get(choice.captureId);
    const records = db.prepare('SELECT record_json FROM dfs_prices WHERE capture_id=? AND player_id IS NOT NULL').all(choice.captureId).map(r => JSON.parse(r.record_json));
    return { records, meta: { ...JSON.parse(capture.metadata_json), key: choice.key, availability: 'archived',
      selection: 'exact-week', referenceSeason: season, referenceWeek: week, available: true, reason: null } };
    });
    if (result) return selectRosterRole(result,rosterPosition);
  }
  if (!captureId) {
    const slates = { ...historical.slates, ...(readWeekly()?.slates || {}) };
    const entry = Object.entries(slates).filter(([,s]) => s.season === season && s.week === week && (slateId || s.scoring === 'DraftKings Classic') && (!slateId || s.id === Number(slateId)))
      .sort(([,a],[,b]) => b.gameCount-a.gameCount || b.capturedAt.localeCompare(a.capturedAt) || a.id-b.id)[0];
    if (entry) {
      const { records,...meta } = entry[1];
      return selectRosterRole({ records: records.filter(r => r.playerId), meta: { ...meta,key:entry[0],availability:'archived',selection:'exact-week',referenceSeason:season,referenceWeek:week,available:true,reason:null } },rosterPosition);
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
      rosterPosition:row?.rosterPosition ?? null, scoring:slate.meta.scoring ?? null,
      projectionBase:row?.projectionBase ?? null, projectionMultiplier:row?.projectionMultiplier ?? 1,
      projectionBasis:row?.projectionBasis ?? null, projectionRulesUrl:row?.projectionRulesUrl ?? null,
      projectionSource: row?.projectionSource ?? null, projectionUrl: row?.projectionUrl ?? null,
      projectionSourceDate: row?.projectionSourceDate ?? null, game: row?.game ?? null,
      projectionCapturedAt: row?.projectionCapturedAt ?? slate.meta.capturedAt ?? null,
      salaryAvailable: Number.isFinite(row?.salary), projectionAvailable: Number.isFinite(row?.projection),
      salaryUnavailableReason: row ? null : slate.meta.reason || 'Player has no unambiguous salary identity in this slate.',
      projectionUnavailableReason: Number.isFinite(row?.projection) ? null : row?.projectionUnavailableReason || slate.meta.reason || 'No verified provider projection for this player and slate.',
      availability: slate.meta.availability, selection: slate.meta.selection ?? slate.meta.requestedKey ?? 'current' } };
}

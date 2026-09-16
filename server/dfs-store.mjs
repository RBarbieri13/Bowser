import { readFileSync, existsSync } from 'node:fs';

const historical = JSON.parse(readFileSync(new URL('../data/dfs-week1-2026.json', import.meta.url), 'utf8'));
const weeklyPath = new URL('../data/dfs-weekly.json', import.meta.url);

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
  const slates = { ...historical.slates, ...(weekly?.slates || {}) };
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

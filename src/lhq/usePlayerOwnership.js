import { useEffect, useMemo, useState } from 'react';
import { defaultLeagueMapping, ownershipIndex, ownershipLeagues, playerOwnership, validOwnershipClock } from './ownershipModel.js';

/** Scoped Yahoo observations; no localStorage, public exports, or retained account cache. */
export function usePlayerOwnership(yahoo, season) {
  const account = yahoo?.status?.connected && yahoo?.account?.season === Number(season) ? yahoo.account : null;
  const leagues = useMemo(() => ownershipLeagues(account), [account]);
  const [capture, setCapture] = useState({ account: null, pools: {}, loading: false, error: '' });
  const [refresh, setRefresh] = useState(0), [clock, setClock] = useState(Date.now);
  const [overrides, setOverrides] = useState({ account: null, values: {} });
  const readPage = yahoo?.loadOwnershipPage, busy = !!yahoo?.busy;
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 30000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    let active = true;
    setCapture({ account, pools: {}, loading: false, error: '' });
    if (!account || busy || !readPage || !leagues.length) return () => { active = false; };
    setCapture({ account, pools: {}, loading: true, error: '' });
    const pools = {}, cursors = new Map(leagues.map(l => [l.key, 0]));
    const run = async () => {
      try {
        // Round-robin pages keep all leagues progressing together; the shared Yahoo
        // queue serializes requests and token refresh. Every page is bounded to 25.
        while (active && cursors.size) {
          for (const league of leagues) {
            if (!active) return;
            if (!cursors.has(league.key)) continue;
            const start = cursors.get(league.key);
            const page = await readPage(league.teamKeys[0], start, () => active);
            if (!active) return;
            const previous = pools[league.key]?.players || [];
            const keys = new Set(previous.map(p => p.key));
            const time = Date.parse(page?.checkedAt || '');
            if (!page || page.start !== start || !Array.isArray(page.players) || page.players.length > 25 || !validOwnershipClock(time) || page.players.some(p => keys.has(p.key)) || new Set(page.players.map(p => p.key)).size !== page.players.length || (page.nextStart !== null && (page.nextStart !== start + 25 || page.nextStart > 5000 || page.players.length !== 25))) {
              delete pools[league.key];
              throw Error('Yahoo ownership loading stopped. Unread players remain unknown; refresh to retry.');
            }
            pools[league.key] = { players: [...previous, ...page.players.map(p => ({ ...p, checkedAt: page.checkedAt }))], complete: !!page.exhausted, checkedAt: page.checkedAt };
            if (page.nextStart === null) cursors.delete(league.key); else cursors.set(league.key, page.nextStart);
            setClock(Date.now());
            setCapture({ account, pools: { ...pools }, loading: !!cursors.size, error: page.limitReached ? 'Yahoo page limit reached; unread players remain unknown.' : '' });
          }
        }
      } catch (error) {
        if (active) setCapture({ account, pools: { ...pools }, loading: false, error: error.message });
      }
    };
    run();
    return () => { active = false; };
  }, [account, leagues, busy, readPage, refresh]);
  const pools = capture.account === account && account ? capture.pools : {};
  const indices = useMemo(() => Object.fromEntries(Object.entries(pools).map(([key, pool]) => [key, ownershipIndex(pool.players)])), [pools]);
  const mapping = { ...defaultLeagueMapping(leagues), ...(overrides.account === account ? overrides.values : {}) };
  const statesFor = row => {
    const byLeague = Object.fromEntries(leagues.map(l => [l.key, playerOwnership(row, indices[l.key], clock)]));
    return { states: Object.fromEntries(['L', 'E', 'F'].map(k => [k, byLeague[mapping[k]] || 'unknown'])), all: leagues.map(l => byLeague[l.key]) };
  };
  const observations = Object.values(pools).flatMap(pool => pool.players);
  const oldest = observations.length ? Math.min(...observations.map(p => Date.parse(p.checkedAt))) : null;
  return {
    leagues, mapping, statesFor, connected: !!account,
    loading: capture.account === account && capture.loading,
    error: capture.account === account ? capture.error : '',
    observed: observations.length, oldest,
    complete: leagues.length > 0 && leagues.every(l => pools[l.key]?.complete),
    refresh: () => setRefresh(n => n + 1),
    assign: (letter, key) => setOverrides(previous => ({ account, values: { ...(previous.account === account ? previous.values : {}), [letter]: key } })),
  };
}

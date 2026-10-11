import { useEffect, useMemo, useRef, useState } from 'react';
import { defaultLeagueMapping, ownershipIndex, ownershipLeagues, playerOwnership, validOwnershipClock, OWNERSHIP_MAX_AGE } from './ownershipModel.js';
import { readOwnershipCache, writeOwnershipCache, clearOwnershipCache, SNAPSHOT_MAX_AGE } from './ownershipCache.js';

/** Mount once in LhqApp. Cache unlock follows fresh authenticated membership. */
export function usePlayerOwnership(yahoo, season) {
  const account = yahoo?.status?.connected && yahoo?.account?.season === Number(season) ? yahoo.account : null;
  const leagues = useMemo(() => ownershipLeagues(account), [account]);
  const [capture, setCapture] = useState({ account: null, pools: {}, loading: false, error: '' });
  const [refresh, setRefresh] = useState(0), [clock, setClock] = useState(Date.now);
  const [overrides, setOverrides] = useState({ account: null, values: {} });
  const current = useRef(capture), attemptedAt = useRef(0), handledRefresh = useRef(0);
  current.current = capture;
  const readPage = yahoo?.loadOwnershipPage, busy = !!yahoo?.busy;
  useEffect(() => {
    const wake = () => {
      setClock(Date.now());
      // One bounded attempt per interval. Provider failures never create a retry loop.
      if (account && !busy && !current.current.loading && document.visibilityState !== 'hidden' && Date.now() - attemptedAt.current >= OWNERSHIP_MAX_AGE) setRefresh(n => n + 1);
    };
    const timer = setInterval(wake, 30000);
    document.addEventListener('visibilitychange', wake);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', wake); };
  }, [account, busy]);
  useEffect(() => {
    if (yahoo?.status?.connected === false) clearOwnershipCache();
  }, [yahoo?.status?.connected]);
  useEffect(() => {
    let active = true;
    if (!account) { setCapture({ account: null, pools: {}, loading: false, error: '' }); return () => { active = false; }; }
    if (busy || !readPage || !leagues.length) return () => { active = false; };
    const force = refresh !== handledRefresh.current;
    handledRefresh.current = refresh;
    const grant = account.ownershipCache;
    const prior = current.current.account === account ? current.current.pools : {};
    setCapture({ account, pools: prior, loading: true, error: '' });
    const run = async () => {
      const saved = await readOwnershipCache(grant, leagues.map(l => l.key));
      if (!active) return;
      let fallback = saved?.pools || prior;
      const freshAt = saved?.savedAt || 0;
      if (saved) setCapture({ account, pools: fallback, loading: false, error: '', saved: true });
      if (!force && saved && Date.now() - freshAt < OWNERSHIP_MAX_AGE) { attemptedAt.current = freshAt; return; }
      attemptedAt.current = Date.now();
      setCapture({ account, pools: fallback, loading: true, error: '', saved: !!saved });
      const pools = {}, cursors = new Map(leagues.map(l => [l.key, 0]));
      try {
        // Read-only, serialized round-robin pages. Replace an existing full snapshot
        // atomically, so a background scan never blanks or mixes its observations.
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
              throw Error('Yahoo ownership refresh stopped. Last checked values retained; unread players remain unknown.');
            }
            pools[league.key] = { players: [...previous, ...page.players.map(p => ({ ...p, checkedAt: page.checkedAt }))], complete: !!page.exhausted, checkedAt: page.checkedAt };
            if (page.nextStart === null) cursors.delete(league.key); else cursors.set(league.key, page.nextStart);
            setClock(Date.now());
            if (!Object.keys(fallback).length) setCapture({ account, pools: { ...pools }, loading: !!cursors.size, error: '' });
            if (page.limitReached || page.nextStart === null && !page.exhausted) throw Error('Yahoo page limit reached; unread players remain unknown.');
          }
        }
        if (!active) return;
        fallback = pools;
        const savedOk = await writeOwnershipCache(grant, pools, () => active);
        if (active) setCapture({ account, pools, loading: false, saved: savedOk, error: grant && !savedOk ? 'Browser snapshot unavailable; ownership is available for this session.' : '' });
      } catch (error) {
        if (active) setCapture({ account, pools: Object.keys(fallback).length ? fallback : { ...pools }, loading: false, error: error.message });
      }
    };
    // Cross-tab lock: a second tab reads the first tab's completed snapshot before
    // deciding whether it needs a scan. No Yahoo payload travels between tabs.
    const start = async () => {
      if (grant?.scope && navigator.locks?.request) await navigator.locks.request(`bowser-ownership:${grant.scope}`, async () => { if (active) await run(); });
      else await run();
    };
    start().catch(() => { if (active) setCapture({ account, pools: prior, loading: false, error: 'Ownership refresh unavailable. Retry shortly.' }); });
    return () => { active = false; };
  }, [account, leagues, busy, readPage, refresh]);
  const pools = capture.account === account && account ? capture.pools : {};
  const indices = useMemo(() => Object.fromEntries(Object.entries(pools).map(([key, pool]) => [key, ownershipIndex(pool.players)])), [pools]);
  const mapping = { ...defaultLeagueMapping(leagues), ...(overrides.account === account ? overrides.values : {}) };
  const statesFor = row => {
    const byLeague = Object.fromEntries(leagues.map(l => [l.key, playerOwnership(row, indices[l.key], clock, SNAPSHOT_MAX_AGE)]));
    return { states: Object.fromEntries(['L', 'E', 'F'].map(k => [k, byLeague[mapping[k]] || 'unknown'])), all: leagues.map(l => byLeague[l.key]) };
  };
  const observations = Object.values(pools).flatMap(pool => pool.players);
  const oldest = observations.length ? Math.min(...observations.map(p => Date.parse(p.checkedAt))) : null;
  return {
    leagues, mapping, statesFor, connected: !!account,
    loading: capture.account === account && capture.loading,
    error: capture.account === account ? capture.error : '',
    saved: capture.account === account && capture.saved,
    observed: observations.length, oldest,
    complete: leagues.length > 0 && leagues.every(l => pools[l.key]?.complete),
    refresh: () => { if (!current.current.loading) setRefresh(n => n + 1); },
    assign: (letter, key) => setOverrides(previous => ({ account, values: { ...(previous.account === account ? previous.values : {}), [letter]: key } })),
  };
}

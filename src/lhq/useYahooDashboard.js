import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { leagueSummaries, rosterExposure } from './yahooModel.js';

const API = '/api/v1/auth/yahoo/';
const TEAM_LIMIT = 32;
const LOG_LIMIT = 100;
const MESSAGES = {
  not_connected: 'Connect your Yahoo Fantasy account first.',
  authorization_expired: 'Yahoo authorization expired. Reconnect your account.',
  fantasy_access_denied: 'Yahoo denied Fantasy API access. Check the authorized account and app permission.',
  rate_limited: 'Yahoo request limit reached. Wait before refreshing.',
  not_configured: 'Yahoo connection is not configured for this deployment.',
  team_not_owned: 'Yahoo no longer confirms this team belongs to the connected account. Reload your teams.',
  invalid_token_response: 'Yahoo returned an incomplete authorization response. Reconnect your account.',
  session_too_large: 'Yahoo returned a session too large to save securely.',
  missing_code: 'Yahoo did not return an authorization code. Connect again.',
  wrong_host: 'Open Yahoo Connection on the registered Bowser domain.',
  yahoo_unavailable: 'Yahoo could not return the requested fantasy data. Try again shortly.',
  league_mismatch: 'Yahoo returned data for a different league or season.',
  week_mismatch: 'Yahoo returned data for a different week.',
  invalid_week: 'Choose an NFL week from 1 to 18, or Current.',
  invalid_team: 'Select one of your discovered Yahoo teams.',
  invalid_query: 'The Yahoo research selection is invalid.',
  invalid_players: 'Choose a bounded visible player list for Yahoo ownership lookup.',
  invalid_player_keys: 'Choose valid Yahoo player keys for this season.',
  invalid_data_response: 'Yahoo returned data for an unexpected team, season, or week.',
  connection_failed: 'Yahoo could not be reached. Try again shortly.',
  declined: 'Yahoo authorization was declined. Connect again when ready.',
  invalid_state: 'The connection request expired or did not match this browser. Connect again.',
};
const AUTH_ERRORS = new Set(['not_connected', 'authorization_expired', 'invalid_token_response']);
const STOP_ERRORS = new Set([...AUTH_ERRORS, 'fantasy_access_denied', 'team_not_owned', 'rate_limited']);
const LOG_MESSAGES = { open: 'Yahoo connection view opened.', redirect: 'Opening Yahoo authorization.', authorized: 'Encrypted browser session is authorized.', refreshed: 'Token refresh and account discovery verified.', disconnected: 'Browser connection cleared.', loaded: 'Dashboard reads finished.', research: 'Requested research read finished.', failed: 'A Yahoo request could not be completed.' };
const safeError = error => ({ code: Object.hasOwn(MESSAGES, error?.code) ? error.code : 'connection_failed', message: Object.hasOwn(MESSAGES, error?.code) ? MESSAGES[error.code] : MESSAGES.connection_failed });
const validWeek = value => value === 'current' || /^(?:[1-9]|1[0-8])$/.test(String(value));
const error = code => Object.assign(new Error(MESSAGES[code]), { code });

// Serialize even separate hook instances/remounts to avoid racing cookie refreshes.
// The queue retains no response body after each caller consumes its result.
let queue = Promise.resolve();
function enqueue(operation) {
  const result = queue.then(operation, operation);
  queue = result.then(() => undefined, () => undefined);
  return result;
}
async function request(action, method = 'GET') {
  try {
    const response = await fetch(`${API}${action}`, { method, credentials: 'same-origin', cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw error(Object.hasOwn(MESSAGES, data.error?.code) ? data.error.code : 'connection_failed');
    return data;
  } catch (caught) { throw error(safeError(caught).code); }
}
const emptyData = season => ({ season, account: null, dashboards: {}, research: {} });
const defaultNavigate = url => window.location.assign(url);

/** Private, in-memory Yahoo account state. Mount once in the app and share its result across Yahoo/League Hub views. */
export function useYahooDashboard({ season = 2026, initialWeek = 'current', navigate = defaultNavigate } = {}) {
  const [week, updateWeek] = useState(validWeek(initialWeek) ? String(initialWeek) : 'current');
  const [status, setStatus] = useState(null);
  const [data, setData] = useState(() => emptyData(season));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(true);
  const [researchBusy, setResearchBusy] = useState({});
  const [log, setLog] = useState([]);
  const revision = useRef(0), mounted = useRef(false), latest = useRef(data), researchRevision = useRef({});
  latest.current = data;
  const appendLog = useCallback((event, outcome = 'success') => {
    if (mounted.current) setLog(entries => [...entries, { at: new Date().toISOString(), event, outcome, message: LOG_MESSAGES[event] }].slice(-LOG_LIMIT));
  }, []);
  const current = id => mounted.current && id === revision.current;
  const clear = useCallback(() => {
    const next = emptyData(season); latest.current = next; setData(next); setResearchBusy({});
  }, [season]);
  const handleFailure = (caught, key, id) => {
    if (!current(id)) return;
    const problem = safeError(caught);
    setErrors(previous => ({ ...previous, [key]: problem.message }));
    appendLog('failed', 'error');
    if (STOP_ERRORS.has(problem.code)) {
      // Cancel every queued read for this view, including a dashboard batch when research fails.
      revision.current++; setBusy(false); setResearchBusy({});
      if (problem.code !== 'rate_limited') clear();
      if (AUTH_ERRORS.has(problem.code)) setStatus(previous => ({ ...previous, connected: false }));
    }
    return problem;
  };

  const load = useCallback(async ({ refreshToken = false } = {}) => {
    const id = ++revision.current;
    clear(); setErrors({}); setBusy(true);
    const read = action => enqueue(() => current(id) ? request(action) : null);
    try {
      if (refreshToken) {
        await enqueue(() => current(id) ? request('refresh', 'POST') : null);
        if (!current(id)) return;
      }
      const nextStatus = await read('status');
      if (!current(id)) return;
      if (!nextStatus || typeof nextStatus.connected !== 'boolean' || typeof nextStatus.configured !== 'boolean') throw error('invalid_data_response');
      setStatus({ configured: nextStatus.configured, connected: nextStatus.connected, connectionUrl: nextStatus.connectionUrl || null, expiresAt: nextStatus.expiresAt || null, storage: nextStatus.storage || null });
      if (!nextStatus.connected) return;
      appendLog('authorized');
      const account = await read(`leagues?${new URLSearchParams({ season })}`);
      if (!current(id)) return;
      if (!account || !Array.isArray(account.teams) || !Array.isArray(account.leagues) || (account.season != null && account.season !== Number(season)) || account.teams.some(team => !/^\d+\.l\.\d+\.t\.\d+$/.test(team.key) || team.leagueKey !== team.key.split('.t.')[0])) throw error('invalid_data_response');
      const nextAccount = { season: Number(season), leagues: account.leagues, teams: [...new Map(account.teams.map(team => [team.key, team])).values()], checkedAt: account.checkedAt || null };
      setData(previous => ({ ...previous, account: nextAccount }));
      latest.current = { ...latest.current, account: nextAccount };
      if (refreshToken) appendLog('refreshed');
      for (const team of nextAccount.teams.slice(0, TEAM_LIMIT)) {
        if (!current(id)) return;
        try {
          const dashboard = await read(`dashboard?${new URLSearchParams({ season, team: team.key, week })}`);
          if (!current(id)) return;
          if (!dashboard || dashboard.teamKey !== team.key || dashboard.season !== Number(season) || !validWeek(dashboard.week) || dashboard.week === 'current' || (week !== 'current' && dashboard.week !== Number(week))) throw error('invalid_data_response');
          setData(previous => ({ ...previous, dashboards: { ...previous.dashboards, [team.key]: dashboard } }));
        } catch (caught) {
          const problem = handleFailure(caught, team.key, id);
          if (!current(id) || STOP_ERRORS.has(problem?.code)) break;
        }
      }
      if (current(id)) appendLog('loaded');
    } catch (caught) { handleFailure(caught, 'connection', id); }
    finally { if (current(id)) setBusy(false); }
  }, [season, week, clear, appendLog]);

  useEffect(() => {
    mounted.current = true;
    appendLog('open');
    return () => { mounted.current = false; revision.current++; };
  }, [appendLog]);
  useEffect(() => {
    load();
    return () => { revision.current++; };
  }, [load]);

  const setWeek = useCallback(value => {
    if (!validWeek(value)) { setErrors(previous => ({ ...previous, week: MESSAGES.invalid_week })); return; }
    if (String(value) === week) return;
    revision.current++; clear(); updateWeek(String(value));
  }, [week, clear]);
  const refresh = useCallback(() => load({ refreshToken: true }), [load]);
  const disconnect = useCallback(async () => {
    const id = ++revision.current;
    clear(); setErrors({}); setBusy(true);
    try {
      await enqueue(() => current(id) ? request('disconnect', 'POST') : null);
      if (!current(id)) return;
      setStatus(previous => ({ ...previous, connected: false, expiresAt: null }));
      appendLog('disconnected');
    } catch (caught) { handleFailure(caught, 'connection', id); }
    finally { if (current(id)) setBusy(false); }
  }, [clear, appendLog]);
  let connectionUrl = `${API}start`;
  try { const url = new URL(status?.connectionUrl); if (url.protocol === 'https:') connectionUrl = `${url.origin}${API}start`; } catch { /* Canonical relative route handles redirection. */ }
  const connect = useCallback(() => {
    if (!status?.configured) { setErrors(previous => ({ ...previous, connection: MESSAGES.not_configured })); return null; }
    revision.current++; clear(); setBusy(false); appendLog('redirect'); navigate(connectionUrl); return connectionUrl;
  }, [status?.configured, connectionUrl, clear, appendLog, navigate]);

  const loadResearch = useCallback(async (teamKey, { include = 'availability,trades', availabilityStart = 0, availabilityStatus = 'FA', players = [], playerKeys = [] } = {}) => {
    const id = revision.current;
    const key = `research:${teamKey}`;
    const account = latest.current.season === season ? latest.current.account : null;
    if (!account?.teams.some(team => team.key === teamKey)) { setErrors(previous => ({ ...previous, [key]: MESSAGES.invalid_team })); return null; }
    const parts = Array.isArray(include) ? include : String(include).split(',');
    const safePlayers = Array.isArray(players) ? players.filter(player => player && typeof player.id === 'string' && typeof player.name === 'string' && typeof player.team === 'string' && typeof player.position === 'string').slice(0, 24) : [];
    const safePlayerKeys = Array.isArray(playerKeys) ? playerKeys.filter(playerKey => typeof playerKey === 'string' && /^\d+\.p\.\d+$/.test(playerKey)).slice(0, 24) : [];
    if (!parts.length || parts.some(part => !['availability', 'trades', 'transactions', 'ownership'].includes(part)) || !Number.isInteger(availabilityStart) || availabilityStart < 0 || availabilityStart > 5000 || !['FA', 'W', 'A'].includes(availabilityStatus) || (parts.includes('ownership') && !safePlayers.length && !safePlayerKeys.length)) { setErrors(previous => ({ ...previous, [key]: MESSAGES.invalid_query })); return null; }
    const ticket = (researchRevision.current[teamKey] || 0) + 1;
    researchRevision.current[teamKey] = ticket;
    const active = () => current(id) && researchRevision.current[teamKey] === ticket;
    setResearchBusy(previous => ({ ...previous, [teamKey]: true }));
    setErrors(previous => { const next = { ...previous }; delete next[key]; return next; });
    try {
      const query = new URLSearchParams({ season, team: teamKey, include: parts.join(','), availabilityStart, availabilityStatus });
      if (safePlayers.length) query.set('players', JSON.stringify(safePlayers));
      if (safePlayerKeys.length) query.set('playerKeys', safePlayerKeys.join(','));
      const result = await enqueue(() => active() ? request(`league-research?${query}`) : null);
      if (!active()) return null;
      if (!result || result.teamKey !== teamKey || result.leagueKey !== teamKey.split('.t.')[0] || result.season !== Number(season)) throw error('invalid_data_response');
      // Preserve the server's single-page completeness, pagination, and coverage exactly.
      setData(previous => ({ ...previous, research: { ...previous.research, [teamKey]: result } }));
      appendLog('research');
      return result;
    } catch (caught) {
      if (active()) {
        handleFailure(caught, key, id);
        setData(previous => { const next = { ...previous.research }; delete next[teamKey]; return { ...previous, research: next }; });
      }
      return null;
    } finally { if (active()) setResearchBusy(previous => ({ ...previous, [teamKey]: false })); }
  }, [season, clear, appendLog]);

  const visible = data.season === season ? data : emptyData(season);
  const summaries = useMemo(() => leagueSummaries(visible), [visible]);
  const exposure = useMemo(() => rosterExposure(visible.account, visible.dashboards), [visible]);
  const callbackResult = new URLSearchParams(window.location.hash.split('?')[1]).get('result');
  return {
    status, account: visible.account, leagues: visible.account?.leagues || [], teams: visible.account?.teams || [],
    dashboards: visible.dashboards, research: visible.research, summaries, exposure,
    errors, error: errors.connection || '', busy, researchBusy, log, week, setWeek,
    connectionUrl, connectionNotice: Object.hasOwn(MESSAGES, callbackResult) ? MESSAGES[callbackResult] : '',
    load, refresh, disconnect, connect, loadResearch,
    coverage: { teamLimit: TEAM_LIMIT, totalTeams: visible.account?.teams.length ?? null, loadedTeams: Object.keys(visible.dashboards).length, complete: Boolean(visible.account) && visible.account.teams.length === Object.keys(visible.dashboards).length },
  };
}

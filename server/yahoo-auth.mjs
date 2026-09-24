import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

const PREFIX = '/api/v1/auth/yahoo/';
const COOKIE = '__Host-bowser-yahoo';
const FLOW = '__Host-bowser-yahoo-flow';
const SESSION_SECONDS = 8 * 60 * 60;
const AUTH_URL = 'https://api.login.yahoo.com/oauth2/request_auth';
const TOKEN_URL = 'https://api.login.yahoo.com/oauth2/get_token';
const API_URL = 'https://fantasysports.yahooapis.com/fantasy/v2/';

class YahooError extends Error {
  constructor(code, message, status = 400) { super(message); Object.assign(this, { code, status }); }
}
const fail = (code, message, status) => { throw new YahooError(code, message, status); };

export function seal(value, secret, purpose) {
  const key = hkdfSync('sha256', secret, 'bowser-yahoo-v1', purpose, 32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}
export function unseal(value, secret, purpose, now = Date.now()) {
  try {
    if (!value || value.length > 3800) return null;
    const data = Buffer.from(value, 'base64url');
    const key = hkdfSync('sha256', secret, 'bowser-yahoo-v1', purpose, 32);
    const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
    decipher.setAuthTag(data.subarray(12, 28));
    const result = JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString());
    return Number.isFinite(result.expiresAt) && result.expiresAt > now ? result : null;
  } catch { return null; }
}
function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(part => {
    const i = part.indexOf('='); return i < 0 ? [] : [part.slice(0, i).trim(), part.slice(i + 1).trim()];
  }).filter(pair => pair.length));
}
function cookie(res, name, value, seconds) {
  if (value.length > 3800) fail('session_too_large', 'Yahoo returned a session too large to save securely.', 502);
  const previous = res.getHeader('Set-Cookie') || [];
  res.setHeader('Set-Cookie', [...(Array.isArray(previous) ? previous : [previous]), `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0, seconds)}`]);
}
function same(a, b) {
  return typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
function json(res, status, body) {
  res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(body));
}
function redirect(res, location) { res.statusCode = 303; res.setHeader('Location', location); res.end(); }

// Yahoo nests entities inside arrays of metadata fragments and numbered collections.
export function metadata(value) {
  if (Array.isArray(value)) return Object.assign({}, ...value.map(metadata));
  return value && typeof value === 'object' ? value : {};
}
export function entities(value, name, found = []) {
  if (!value || typeof value !== 'object') return found;
  for (const [key, child] of Object.entries(value)) {
    if (key === name) found.push(metadata(child));
    else entities(child, name, found);
  }
  return found;
}
function number(value) { return value === undefined || value === null || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null; }
function text(value) { return typeof value === 'string' ? value : ''; }
function seasonParam(params) {
  const season = params.get('season') || String(new Date().getUTCFullYear());
  if (!/^\d{4}$/.test(season) || Number(season) < 2001 || Number(season) > new Date().getUTCFullYear() + 1) fail('invalid_season', 'Choose a valid Yahoo NFL season.');
  return season;
}

export function createYahooHandler({ env = process.env, fetcher = fetch, now = () => Date.now() } = {}) {
  return async function yahooHandler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
    res.setHeader('Vary', 'Cookie');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const url = new URL(req.originalUrl || req.url, 'https://local.invalid');
    const action = url.pathname.startsWith(PREFIX) ? url.pathname.slice(PREFIX.length) : url.searchParams.get('action') || 'status';
    const secret = env.YAHOO_CLIENT_SECRET;
    const clientId = env.YAHOO_CLIENT_ID;
    let callback;
    try { callback = new URL(env.YAHOO_REDIRECT_URI); } catch {}
    const configured = Boolean(secret && clientId && callback?.protocol === 'https:' && callback.pathname === `${PREFIX}callback` && !callback.search && !callback.hash && !callback.username && !callback.password);
    const saved = cookies(req);
    const session = configured ? unseal(saved[COOKIE], secret, 'session', now()) : null;
    const setSession = value => cookie(res, COOKIE, seal(value, secret, 'session'), Math.floor((value.expiresAt - now()) / 1000));
    const clear = () => cookie(res, COOKIE, '', 0);
    const postActions = ['refresh', 'disconnect'];
    try {
      if (!['status', 'start', 'callback', 'leagues', 'roster', ...postActions].includes(action)) return json(res, 404, { error: { code: 'not_found', message: 'Unknown Yahoo action.' } });
      if (req.method !== (postActions.includes(action) ? 'POST' : 'GET')) { res.setHeader('Allow', postActions.includes(action) ? 'POST' : 'GET'); return json(res, 405, { error: { code: 'method_not_allowed', message: 'Unsupported request method.' } }); }
      if (action === 'status') return json(res, 200, { configured, connected: Boolean(session), expiresAt: session ? new Date(session.expiresAt).toISOString() : null, connectionUrl: configured ? `${callback.origin}/#/yahoo` : null, storage: 'Encrypted HttpOnly cookie; eight-hour browser session. No background imports.' });
      if (!configured) fail('not_configured', 'Yahoo credentials or the HTTPS callback are not configured for this deployment.', 503);
      if (req.headers.host !== callback.host) {
        if (action === 'start') return redirect(res, `${callback.origin}${PREFIX}start`);
        fail('wrong_host', 'Open Yahoo Connection on the registered Bowser domain.', 400);
      }
      if (postActions.includes(action) && req.headers.origin !== callback.origin) fail('invalid_origin', 'Reload Bowser before trying again.', 403);
      if (action === 'disconnect') { clear(); return json(res, 200, { connected: false }); }
      if (action === 'start') {
        const state = randomBytes(32).toString('base64url');
        cookie(res, FLOW, seal({ state, expiresAt: now() + 600_000 }, secret, 'flow'), 600);
        const destination = new URL(AUTH_URL);
        destination.search = new URLSearchParams({ client_id: clientId, redirect_uri: callback.href, response_type: 'code', state }).toString();
        return redirect(res, destination.href);
      }
      async function exchange(body) {
        const response = await fetcher(TOKEN_URL, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString() });
        if (!response.ok) {
          if ([400, 401].includes(response.status)) fail('authorization_expired', 'Yahoo could not authorize this session. Reconnect; if it repeats, verify the app credentials and callback.', 401);
          fail('yahoo_unavailable', 'Yahoo authorization is temporarily unavailable. Try again shortly.', 502);
        }
        const payload = await response.json();
        if (!payload.access_token || !Number.isFinite(Number(payload.expires_in)) || Number(payload.expires_in) <= 0) fail('invalid_token_response', 'Yahoo returned an incomplete authorization response.', 502);
        return payload;
      }
      if (action === 'callback') {
        const flow = unseal(saved[FLOW], secret, 'flow', now());
        cookie(res, FLOW, '', 0);
        if (!flow || !same(flow.state, url.searchParams.get('state'))) fail('invalid_state', 'The connection request expired or did not match this browser. Start again.', 403);
        if (url.searchParams.has('error')) return redirect(res, `${callback.origin}/#/yahoo?result=declined`);
        const code = url.searchParams.get('code');
        if (!code || code.length > 4096) fail('missing_code', 'Yahoo did not return an authorization code. Start again.');
        const token = await exchange({ grant_type: 'authorization_code', code, redirect_uri: callback.href });
        if (!token.refresh_token) fail('invalid_token_response', 'Yahoo did not return a refresh token. Reconnect.', 502);
        setSession({ access: token.access_token, refresh: token.refresh_token, tokenExpiresAt: now() + Number(token.expires_in) * 1000, expiresAt: now() + SESSION_SECONDS * 1000 });
        return redirect(res, `${callback.origin}/#/yahoo?result=connected`);
      }
      if (!session) fail('not_connected', 'Connect your Yahoo Fantasy account first.', 401);
      async function refresh() {
        const token = await exchange({ grant_type: 'refresh_token', refresh_token: session.refresh, redirect_uri: callback.href });
        session.access = token.access_token;
        session.refresh = token.refresh_token || session.refresh;
        session.tokenExpiresAt = now() + Number(token.expires_in) * 1000;
        setSession(session);
      }
      if (action === 'refresh') { await refresh(); return json(res, 200, { refreshed: true, checkedAt: new Date(now()).toISOString() }); }
      if (session.tokenExpiresAt <= now() + 60_000) await refresh();
      async function query(path, retried = false) {
        const response = await fetcher(`${API_URL}${path}?format=json`, { headers: { Authorization: `Bearer ${session.access}`, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(15000) });
        if (response.status === 401 && !retried) { await refresh(); return query(path, true); }
        if (response.status === 401) fail('authorization_expired', 'Yahoo access expired. Reconnect your account.', 401);
        if (response.status === 403) fail('fantasy_access_denied', 'Yahoo denied Fantasy API access. Confirm this Client ID is approved for Fantasy Sports – Read and that you authorized the correct account.', 403);
        if (response.status === 429) fail('rate_limited', 'Yahoo request limit reached. Wait before retrying.', 429);
        if (!response.ok) fail('yahoo_unavailable', 'Yahoo could not return the requested fantasy data. Try again shortly.', 502);
        const payload = await response.json();
        if (!payload.fantasy_content || payload.error) fail('invalid_data_response', 'Yahoo returned an unexpected fantasy response.', 502);
        return payload.fantasy_content;
      }
      const season = seasonParam(url.searchParams);
      const userGames = `users;use_login=1/games;game_codes=nfl;seasons=${season}`;
      if (action === 'leagues') {
        const leagues = entities(await query(`${userGames}/leagues`), 'league').map(l => ({ key: text(l.league_key), name: text(l.name), season: number(l.season) ?? Number(season), teams: number(l.num_teams), week: number(l.current_week), scoring: text(l.scoring_type) }));
        const teams = entities(await query(`${userGames}/teams`), 'team').map(t => ({ key: text(t.team_key), leagueKey: text(t.team_key).split('.t.')[0], name: text(t.name) }));
        return json(res, 200, { season: Number(season), leagues, teams, checkedAt: new Date(now()).toISOString() });
      }
      const teamKey = url.searchParams.get('team') || '';
      if (!/^\d+\.l\.\d+\.t\.\d+$/.test(teamKey)) fail('invalid_team', 'Select one of your Yahoo teams.');
      const owned = entities(await query(`${userGames}/teams`), 'team');
      if (!owned.some(t => t.team_key === teamKey)) fail('team_not_owned', 'This team is not one of your teams in the selected season.', 403);
      const rosterData = await query(`team/${teamKey}/roster`);
      const roster = entities(rosterData, 'roster')[0] || {};
      const players = entities(rosterData, 'player').map(p => ({ key: text(p.player_key), name: text(p.name?.full), position: text(p.display_position), team: text(p.editorial_team_abbr), slot: text(metadata(p.selected_position).position), status: text(p.status) }));
      return json(res, 200, { teamKey, season: Number(season), week: number(roster.week), coverageType: text(roster.coverage_type), players, checkedAt: new Date(now()).toISOString() });
    } catch (error) {
      if (error?.code === 'authorization_expired') clear();
      if (action === 'callback' && configured) {
        cookie(res, FLOW, '', 0);
        return redirect(res, `${callback.origin}/#/yahoo?result=${error instanceof YahooError ? error.code : 'connection_failed'}`);
      }
      return json(res, error instanceof YahooError ? error.status : 502, { error: { code: error instanceof YahooError ? error.code : 'connection_failed', message: error instanceof YahooError ? error.message : 'Yahoo could not be reached. Try again shortly.' } });
    }
  };
}
export const yahooHandler = createYahooHandler();

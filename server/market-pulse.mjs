import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROVIDERS = {
  sleeper: { name: 'Sleeper', metric: 'Add / drop counts', docs: 'https://docs.sleeper.com/#trending-players', experimental: false },
  espn: { name: 'ESPN', metric: 'Roster / start percentages', docs: 'https://fantasy.espn.com/football/players/add', experimental: true },
};
export const CACHE_MS = 15 * 60 * 1000;
const POSITIONS = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'DEF' };
const TEAMS = { 1:'ATL',2:'BUF',3:'CHI',4:'CIN',5:'CLE',6:'DAL',7:'DEN',8:'DET',9:'GB',10:'TEN',11:'IND',12:'KC',13:'LV',14:'LAR',15:'MIA',16:'MIN',17:'NE',18:'NO',19:'NYG',20:'NYJ',21:'PHI',22:'ARI',23:'PIT',24:'LAC',25:'SF',26:'SEA',27:'TB',28:'WAS',29:'CAR',30:'JAX',33:'BAL',34:'HOU' };
const number = (value, percentage = false) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && (!percentage || value <= 100) ? value : null;
export function normalizeSleeper(adds, drops, players) {
  if (![adds, drops].every(Array.isArray) || !players || typeof players !== 'object' || Array.isArray(players)) throw new Error('Sleeper response format changed.');
  const rows = new Map();
  for (const [list, field] of [[adds,'adds'], [drops,'drops']]) {
    for (const item of list) {
      if (!item || typeof item.player_id !== 'string' || number(item.count) === null || !Number.isInteger(item.count)) throw new Error('Invalid Sleeper count.');
      const id = item.player_id;
      const p = players[id];
      if (!p) throw new Error('Player catalogue does not cover the trending response.');
      const row = rows.get(id) || { id: `sleeper:${id}`, name: p.full_name || [p.first_name,p.last_name].filter(Boolean).join(' ') || id, position: p.position || '—', team: p.team || 'FA', gsisId: p.gsis_id || null, adds: null, drops: null, rosterPct: null, startPct: null };
      row[field] = item.count;
      rows.set(id,row);
    }
  }
  return [...rows.values()].map(row => ({ ...row, net: row.adds !== null && row.drops !== null ? row.adds-row.drops : null, addShare: row.adds !== null && row.drops !== null && row.adds+row.drops > 0 ? 100*row.adds/(row.adds+row.drops) : null }));
}
export function normalizeEspn(payload) {
  if (!Array.isArray(payload?.players) || !payload.players.length) throw new Error('ESPN response format changed or returned no players.');
  return payload.players.map(({player:p}) => {
    if (!p || !Number.isInteger(p.id) || typeof p.fullName !== 'string' || !p.ownership || number(p.ownership.percentOwned,true) === null) throw new Error('Invalid ESPN ownership response.');
    return { id:`espn:${p.id}`, name:p.fullName, position:POSITIONS[p.defaultPositionId] || '—', team:TEAMS[p.proTeamId] || 'FA', adds:null,drops:null,net:null,addShare:null,rosterPct:number(p.ownership.percentOwned,true),startPct:number(p.ownership.percentStarted,true) };
  });
}
export async function fetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, redirect:'error', signal:AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}.`);
  const chunks=[]; let size=0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 25*1024*1024) throw new Error('Provider response exceeds safety limit.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function createMarketPulse({ filename, fetcher = fetchJson, now = Date.now } = {}) {
  const file = filename || resolve(dirname(fileURLToPath(import.meta.url)), '../artifacts/market-pulse/snapshots.sqlite');
  if (file !== ':memory:') mkdirSync(dirname(file), {recursive:true});
  const db = new DatabaseSync(file);
  db.exec('CREATE TABLE IF NOT EXISTS pulse_snapshots (provider TEXT, window TEXT, captured INTEGER, payload TEXT, PRIMARY KEY(provider,window,captured)); CREATE TABLE IF NOT EXISTS pulse_state (key TEXT PRIMARY KEY, payload TEXT);');
  const stateGet = key => { const r=db.prepare('SELECT payload FROM pulse_state WHERE key=?').get(key); return r ? JSON.parse(r.payload) : null; };
  const statePut = (key,val) => db.prepare('INSERT OR REPLACE INTO pulse_state VALUES (?,?)').run(key,JSON.stringify(val));
  const pending=new Map(); let cataloguePending;
  function validate(provider, hours) {
    if (!Object.hasOwn(PROVIDERS, provider)) throw new Error('Unknown provider.');
    if (![6,24,72].includes(Number(hours))) throw new Error('Window must be 6, 24, or 72 hours.');
    return provider === 'sleeper' ? String(hours) : 'current';
  }
  function read(provider='sleeper', hours=24) {
    const window = validate(provider,hours);
    const snapshots=db.prepare('SELECT captured,payload FROM pulse_snapshots WHERE provider=? AND window=? ORDER BY captured DESC LIMIT 96').all(provider,window);
    const current=snapshots[0];
    const attempt=stateGet(`attempt:${provider}:${window}`);
    const rows=current ? JSON.parse(current.payload) : [];
    const previous=snapshots[1] ? new Map(JSON.parse(snapshots[1].payload).map(p=>[p.id,p])) : null;
    return { provider, source:PROVIDERS[provider], window, capturedAt:current?.captured || null, lastAttemptAt:attempt?.at || null, error:attempt?.error || null, nextRefreshAt:Math.max(current?.captured ? current.captured+CACHE_MS : 0, attempt?.at ? attempt.at+60000 : 0), stale:!!current && now()-current.captured>CACHE_MS, rows:rows.map(row=>({...row,rosterDelta:previous?.get(row.id)?.rosterPct != null && row.rosterPct != null ? row.rosterPct-previous.get(row.id).rosterPct : null})), previousAt:snapshots[1]?.captured || null, history:snapshots.reverse().map(s=>({capturedAt:s.captured,rows:JSON.parse(s.payload)})) };
  }
  async function catalogue() {
    const cached=stateGet('sleeper:catalogue');
    if (cached && now()-cached.at < 86400000) return cached.players;
    if (!cataloguePending) cataloguePending=(async()=>{
      const players=await fetcher('https://api.sleeper.app/v1/players/nfl');
      if (!players || Array.isArray(players) || Object.keys(players).length < 100) throw new Error('Incomplete Sleeper catalogue.');
      statePut('sleeper:catalogue',{at:now(),players}); return players;
    })().finally(()=>{cataloguePending=null;});
    return cataloguePending;
  }
  async function refresh(provider='sleeper', hours=24) {
    const window=validate(provider,hours), key=`${provider}:${window}`;
    if (pending.has(key)) return pending.get(key);
    const existing=read(provider,hours);
    if (now()<existing.nextRefreshAt) return {...existing,cached:true};
    const promise=(async()=>{
      const at=now();
      try {
        let rows;
        if (provider==='sleeper') {
          const [adds,drops,players]=await Promise.all([
            fetcher(`https://api.sleeper.app/v1/players/nfl/trending/add?lookback_hours=${window}&limit=500`),
            fetcher(`https://api.sleeper.app/v1/players/nfl/trending/drop?lookback_hours=${window}&limit=500`),catalogue(),
          ]);
          rows=normalizeSleeper(adds,drops,players);
        } else {
          const date=new Date(at), season=date.getUTCFullYear()-(date.getUTCMonth()<2?1:0);
          rows=normalizeEspn(await fetcher(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leaguedefaults/1?view=kona_player_info`,{headers:{'x-fantasy-filter':JSON.stringify({players:{limit:1000,sortPercOwned:{sortPriority:1,sortAsc:false}}})}}));
        }
        if (new Set(rows.map(r=>r.id)).size!==rows.length) throw new Error('Duplicate player identifiers in provider response.');
        db.exec('BEGIN IMMEDIATE');
        try {
          db.prepare('INSERT OR REPLACE INTO pulse_snapshots VALUES (?,?,?,?)').run(provider,window,now(),JSON.stringify(rows));
          db.prepare('DELETE FROM pulse_snapshots WHERE provider=? AND window=? AND captured NOT IN (SELECT captured FROM pulse_snapshots WHERE provider=? AND window=? ORDER BY captured DESC LIMIT 96)').run(provider,window,provider,window);
          statePut(`attempt:${key}`,{at:now(),error:null}); db.exec('COMMIT');
        } catch(error) { db.exec('ROLLBACK'); throw error; }
      } catch(error) {
        statePut(`attempt:${key}`,{at:now(),error:error instanceof Error ? error.message.slice(0,180) : 'Refresh failed.'});
      }
      return {...read(provider,hours),cached:false};
    })().finally(()=>pending.delete(key));
    pending.set(key,promise); return promise;
  }
  return { read,refresh,close:()=>db.close() };
}

let instance;
export async function marketPulseHandler(req,res) {
  res.setHeader('Cache-Control','no-store'); res.setHeader('Content-Type','application/json');
  const send=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
  // This research prototype must not become a public, unrestricted data proxy.
  const remote=req.socket?.remoteAddress;
  if (process.env.VERCEL || !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote)) return send(403,{error:'Market Pulse is a local personal-research prototype. Public feed distribution is not enabled.'});
  if (!['GET','POST'].includes(req.method)) {res.setHeader('Allow','GET, POST');return send(405,{error:'Method not allowed.'});}
  try {
    const host = new URL(`http://${req.headers.host}`).hostname;
    if (!['localhost','127.0.0.1','[::1]'].includes(host)) return send(403,{error:'Local host required.'});
    if (req.method==='POST' && (req.headers['x-bowser-refresh']!=='1' || (req.headers.origin && new URL(req.headers.origin).host!==req.headers.host))) return send(403,{error:'Same-origin refresh required.'});
    const params=new URL(req.originalUrl || req.url,'http://localhost').searchParams;
    const provider=params.get('provider') || 'sleeper', hours=Number(params.get('hours') || 24);
    if (!Object.hasOwn(PROVIDERS,provider) || ![6,24,72].includes(hours)) return send(400,{error:'Invalid provider or window.'});
    instance ||= createMarketPulse();
    return send(200,req.method==='POST' ? await instance.refresh(provider,hours) : instance.read(provider,hours));
  } catch { return send(500,{error:'Snapshot storage is unavailable. No previous data was replaced.'}); }
}
export function marketPulsePlugin() { return {name:'market-pulse-api',configureServer(server){server.middlewares.use('/api/v1/market-pulse',marketPulseHandler);}}; }

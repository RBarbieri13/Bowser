export const MAX_PACK_BYTES = 2_000_000;
export function safeSourceUrl(value) {
 try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch { return null; }
}
export function parseBriefingPack(text) {
 if (typeof text !== 'string' || text.length > MAX_PACK_BYTES) throw Error('Choose a briefing pack smaller than 2 MB.');
 let data; try { data = JSON.parse(text); } catch { throw Error('This file is not a valid JSON briefing pack.'); }
 if (data?.schema !== 'bowser-private-briefings-v1' || !Array.isArray(data.reports) || !data.reports.length || data.reports.length > 40 || !Array.isArray(data.players) || data.players.length > 3000) throw Error('Unsupported briefing pack.');
 const str = x => typeof x === 'string' && x.length <= 30000;
 const ids = new Set();
 for (const r of data.reports) {
  if (!str(r.id) || ids.has(r.id) || !['daily','waiver'].includes(r.type) || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !Number.isInteger(r.season) || !Number.isInteger(r.week) || r.week < 1 || r.week > 22 || !str(r.title) || !str(r.context) || !Array.isArray(r.sections) || !r.sections.length || r.sections.length > 60 || !Array.isArray(r.sources)) throw Error('Invalid report metadata.');
  ids.add(r.id);
  for (const s of r.sources) if (!str(s.name) || !str(s.url) || (s.date != null && !str(s.date)) || (s.basis != null && !str(s.basis))) throw Error('Invalid report source.');
  const sectionIds = new Set();
  for (const s of r.sections) {
   if (!str(s.id) || sectionIds.has(s.id) || !str(s.title) || !str(s.league) || !Array.isArray(s.blocks) || s.blocks.length > 200) throw Error('Invalid report section.');
   sectionIds.add(s.id);
   for (const b of s.blocks) {
    if (['paragraph','heading','news'].includes(b.kind)) { if (!str(b.text) || b.kind === 'news' && (!str(b.url) || !str(b.date))) throw Error('Invalid report text.'); }
    else if (b.kind === 'table') { if (!Array.isArray(b.headers) || b.headers.length > 24 || !b.headers.every(str) || !Array.isArray(b.rows) || b.rows.length > 500 || !b.rows.every(row=>Array.isArray(row) && row.length === b.headers.length && row.every(str))) throw Error('Invalid report table.'); }
    else if (b.kind === 'comparison') {
     const player = p => p && str(p.name) && (p.pts === null || typeof p.pts === 'number' && Number.isFinite(p.pts)) && (p.rank == null || str(p.rank)) && (p.flag == null || str(p.flag));
     if (!Array.isArray(b.rows) || b.rows.length > 60 || !b.rows.every(row=>str(row.slot) && player(row.starter) && str(row.bench) && Array.isArray(row.options) && row.options.length <= 3 && row.options.every(p=>player(p) && str(p.position) && str(p.waiver)))) throw Error('Invalid starter comparison.');
    } else throw Error('Unsupported report block.');
   }
  }
 }
 for (const p of data.players) if (!str(p.name) || !str(p.player_id) || !Array.isArray(p.aliases) || !p.aliases.every(str) || p.aliases.some(a=>!a.length)) throw Error('Invalid player link map.');
 return data;
}
export function splitPlayerText(text, players) {
 const map = new Map();
 for (const p of players) for (const a of p.aliases) map.set(a, map.has(a) && map.get(a)?.player_id !== p.player_id ? null : p);
 const aliases = [...map.keys()].filter(a=>map.get(a)).sort((a,b)=>b.length-a.length);
 if (!aliases.length) return [{text}];
 const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${aliases.map(a=>a.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')})(?![\\p{L}\\p{N}])`, 'gu');
 const out=[]; let cursor=0;
 for (const m of text.matchAll(pattern)) { if (m.index>cursor) out.push({text:text.slice(cursor,m.index)}); out.push({text:m[0],player:map.get(m[0])}); cursor=m.index+m[0].length; }
 if (cursor<text.length) out.push({text:text.slice(cursor)});
 return out;
}
export function optionSignal(starter, option) {
 const delta=Number.isFinite(starter.pts)&&Number.isFinite(option.pts)?Math.round((option.pts-starter.pts)*100)/100:null;
 const a=/^(QB|RB|WR|TE|K|DST)(\d+)$/.exec(starter.rank||''), b=/^(QB|RB|WR|TE|K|DST)(\d+)$/.exec(option.rank||'');
 return {delta,rankOnly:!(delta>0)&&!!a&&!!b&&a[1]===b[1]&&Number(b[2])<Number(a[2])};
}

export function defenseTeam(name) {
 const teams={Titans:'TEN',Browns:'CLE',Panthers:'CAR',Jets:'NYJ','49ers':'SF','San Francisco':'SF',Cleveland:'CLE',Jacksonville:'JAX','New England':'NE',Chiefs:'KC',Ravens:'BAL',Steelers:'PIT'};
 return teams[String(name).replace(/ (DEF|DST)$/,'')]||null;
}

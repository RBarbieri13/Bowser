// Public Yahoo Transaction Trends only. Never reads a Yahoo account or league.
const TTL=15*60*1000;
const clean=s=>String(s).replace(/<[^>]*>/g,' ').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>String.fromCodePoint(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n))).replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/\s+/g,' ').replace(/[\ue000-\uf8ff]/g,'').trim();
export function parseYahooTrends(html,{date}={}){
 const table=[...html.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map(m=>m[0]).find(t=>t.includes('Drops')&&t.includes('Adds')&&t.includes('% Ros'));
 if(!table)throw Error('Yahoo transaction trend table unavailable.');
 const sourceDate=table.match(/href="[^"]*[?&]date=(\d{4}-\d{2}-\d{2})/);
 if(date&&sourceDate?.[1]!==date)throw Error('Yahoo returned a different calendar date.');
 const headers=[...((table.match(/<thead\b[\s\S]*?<\/thead>/i)||[])[0]||'').matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(m=>clean(m[1]));
 if(headers.indexOf('Adds')<0||headers.indexOf('Drops')<0)throw Error('Yahoo trend columns changed.');
 const rows=[];
 for(const match of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
  const cells=[...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>m[1]);if(!cells.length)continue;
  const id=cells[0].match(/data-ys-playerid="(\d+)"/),name=cells[0].match(/<a\b[^>]*class="[^"]*\bname\b[^"]*"[^>]*>([\s\S]*?)<\/a>/),tp=clean(cells[0]).match(/\b([A-Za-z]{2,3}) - (QB|RB|WR|TE|K|DEF)\b/);
  const number=field=>{const raw=clean(cells[headers.indexOf(field)]||'').replaceAll(',','');if(!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw)))throw Error('Yahoo returned an invalid count.');return Number(raw);};
  if(!id||!name||!tp)throw Error('Yahoo trend player identity changed.');
  const adds=number('Adds'),drops=number('Drops');rows.push({id:`yahoo:${id[1]}`,name:clean(name[1]),team:tp[1].toUpperCase(),position:tp[2],adds,drops,net:adds-drops});
 }
 if(!rows.length||rows.length>100||new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('Yahoo trend list incomplete or duplicated.');
 return rows;
}
export function createYahooTrends({fetcher=fetch,now=Date.now}={}){
 const cache=new Map(),pending=new Map();
 return async (period='today')=>{
  if(!['today','yesterday'].includes(period))throw Error('Choose today or yesterday.');
  const local=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(now());
  const date=new Date(`${local}T12:00:00Z`);if(period==='yesterday')date.setUTCDate(date.getUTCDate()-1);const day=date.toISOString().slice(0,10);
  const saved=cache.get(day);if(saved&&now()<saved.nextRefreshAt)return saved;
  if(pending.has(day))return pending.get(day);
  const job=(async()=>{
   try{
    const sources=['BI_A','BI_D'].map(sort=>`https://football.fantasysports.yahoo.com/f1/buzzindex?bimtab=ALL&date=${day}&pos=ALL&sort=${sort}&src=combined&trendtab=O`);
    const lists=await Promise.all(sources.map(async url=>{const r=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error(`Yahoo public trends HTTP ${r.status}`);const text=await r.text();if(text.length>3000000)throw Error('Yahoo public page too large.');return parseYahooTrends(text,{date:day});}));
    const rows=new Map();for(const list of lists)for(const row of list){const old=rows.get(row.id);if(old&&(old.name!==row.name||old.team!==row.team||old.position!==row.position))throw Error('Conflicting Yahoo identities.');rows.set(row.id,row);}
    const stamp=now(),result={provider:'yahoo',scope:'platform',period,date:day,window:day,capturedAt:stamp,nextRefreshAt:stamp+TTL,rows:[...rows.values()],sources,coverage:'Yahoo-wide Today/Yesterday calendar-date counts; union of the published top-add and top-drop lists. Missing players are unavailable, never zero. Counts are not limited to your leagues.',error:null};cache.set(day,result);while(cache.size>4)cache.delete(cache.keys().next().value);return result;
   }catch(e){const result={...(saved||{provider:'yahoo',scope:'platform',period,date:day,window:day,capturedAt:null,rows:[],sources:[]}),nextRefreshAt:now()+60000,error:e.message,stale:!!saved};cache.set(day,result);while(cache.size>4)cache.delete(cache.keys().next().value);return result;}
  })().finally(()=>pending.delete(day));pending.set(day,job);return job;
 };
}
export const getYahooTrends=createYahooTrends();

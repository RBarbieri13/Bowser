// Public ESPN headlines only; source observations never masquerade as model decisions.
import {createHash} from 'node:crypto';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {newsCandidates,NEWS_URL} from '../server/market-commentary.mjs';
import {fetchJson} from '../server/market-pulse.mjs';

const path=new URL('../data/market-news.json',import.meta.url);
const now=Date.now();
const payload=await fetchJson(NEWS_URL);
const records=newsCandidates(payload,now).map(({text,...record})=>record);
if(!records.length)throw Error('No verified player headlines. Previous news retained.');
const sourceHash=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
let previous;try{previous=JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const changed=JSON.stringify(previous?.records)!==JSON.stringify(records);
if(changed){
 const snapshot={schemaVersion:1,capturedAt:new Date(now).toISOString(),sourceUrl:NEWS_URL,sourceHash,
  coverage:'Public ESPN NFL headlines naming explicitly tagged NFL players. Source observations only; no new Jev classifications.',records};
 await writeFile(new URL('../data/market-news.json.tmp',import.meta.url),JSON.stringify(snapshot,null,2)+'\n');
 await rename(new URL('../data/market-news.json.tmp',import.meta.url),path);
}
console.log(JSON.stringify({changed,records:records.length,capturedAt:changed?new Date(now).toISOString():previous.capturedAt}));

import { readFileSync } from 'node:fs';

const snapshot=JSON.parse(readFileSync(new URL('../data/dfs-week1-2026.json',import.meta.url),'utf8'));
export function getDfsSlate(key='week1') {
  if(!Object.hasOwn(snapshot.slates,key)) return null;
  const {records,...meta}=snapshot.slates[key];
  return {meta:{...meta,key,options:Object.entries(snapshot.slates).map(([key,s])=>({key,label:s.label}))},
    records:records.filter(row=>row.playerId)};
}

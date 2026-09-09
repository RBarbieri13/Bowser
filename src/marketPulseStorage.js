const DB='bowser-market-pulse-v1';
const STORE='snapshots';
const keyFor=(provider,hours)=>`${provider}:${provider==='espn'?'current':hours}`;

async function database() {
  if (!globalThis.indexedDB) return null;
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB,1);
    request.onupgradeneeded=()=>request.result.createObjectStore(STORE);
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(new Error('Browser history is blocked.'));
  });
}

export function mergeSnapshot(previous,incoming,now=Date.now()) {
  if(previous && (previous.provider!==incoming.provider || previous.window!==incoming.window)) previous=null;
  const observations=new Map();
  for(const data of [previous,incoming]) {
    for(const entry of data?.history || []) observations.set(entry.capturedAt,entry);
    if(data?.capturedAt) observations.set(data.capturedAt,{capturedAt:data.capturedAt,rows:data.rows});
  }
  const history=[...observations.values()].sort((a,b)=>a.capturedAt-b.capturedAt).slice(-96);
  const current=history.at(-1), before=history.at(-2);
  // A cold server or older response must never erase a newer browser snapshot.
  const newest=previous?.capturedAt> (incoming.capturedAt || 0) ? previous : incoming;
  const oldRows=new Map((before?.rows || []).map(row=>[row.id,row]));
  return {...newest,error:incoming.error,storage:incoming.storage,history,
    capturedAt:current?.capturedAt || null,previousAt:before?.capturedAt || null,
    stale:!!current && now-current.capturedAt>900000,
    rows:(current?.rows || []).map(row=>({...row,rosterDelta:incoming.provider==='espn'
      ? before && oldRows.get(row.id)?.rosterPct!=null && row.rosterPct!=null ? row.rosterPct-oldRows.get(row.id).rosterPct : null
      : row.rosterDelta})),
  };
}

export async function readSnapshot(provider,hours) {
  const db=await database();
  if(!db) return null;
  try {
    return await new Promise((resolve,reject)=>{
      const request=db.transaction(STORE).objectStore(STORE).get(keyFor(provider,hours));
      request.onsuccess=()=>resolve(request.result || null);
      request.onerror=()=>reject(request.error);
    });
  } finally {db.close();}
}

export async function saveSnapshot(incoming) {
  const db=await database();
  if(!db) return {...incoming,storageError:'Browser history is unavailable. Snapshots will not survive closing this page.'};
  try {
    return await new Promise((resolve,reject)=>{
      // One read/write transaction prevents concurrent tabs from losing observations.
      const transaction=db.transaction(STORE,'readwrite'),store=transaction.objectStore(STORE);
      const key=keyFor(incoming.provider,incoming.window),request=store.get(key);
      let merged;
      request.onsuccess=()=>{
        try {merged=mergeSnapshot(request.result,incoming);store.put(merged,key);}
        catch(error) {transaction.abort();reject(error);}
      };
      transaction.oncomplete=()=>resolve(merged);
      transaction.onerror=()=>reject(transaction.error);
      transaction.onabort=()=>reject(transaction.error || new Error('History could not be saved.'));
    });
  } finally {db.close();}
}

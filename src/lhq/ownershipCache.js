import { validOwnershipClock } from './ownershipModel.js';

export const SNAPSHOT_MAX_AGE = 24 * 60 * 60 * 1000;
const DB = 'bowser-private-ownership-v1', STORE = 'snapshots';
const validGrant = grant => /^[a-f0-9]{64}$/.test(grant?.scope || '') && /^[A-Za-z0-9+/]{43}=$/.test(grant?.key || '') && Date.parse(grant.expiresAt) > Date.now();
const bytes = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
const base64 = data => btoa(Array.from(new Uint8Array(data), b => String.fromCharCode(b)).join(''));
async function dbOperation(mode, operation) {
  if (!globalThis.indexedDB) throw Error('Private browser storage unavailable');
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode), request = operation(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
export async function clearOwnershipCache() {
  try { await dbOperation('readwrite', store => store.clear()); } catch { /* Memory-only remains usable. */ }
}
// No names of leagues/managers, rosters, API tokens, or encryption keys on disk.
// Encrypt only minimal exact player identities and affirmative observations.
export function compactPools(pools) {
  return Object.fromEntries(Object.entries(pools).map(([league, pool]) => [league, {
    complete: pool.complete === true, checkedAt: pool.checkedAt,
    players: pool.players.map(p => ({ key: p.key, name: p.name, team: p.team, position: p.position,
      owned: p.owned, isMine: p.isMine, ownershipType: p.ownershipType, checkedAt: p.checkedAt })),
  }]));
}
export function validSnapshot(snapshot, leagueKeys, now = Date.now()) {
  if (snapshot?.version !== 1 || !validOwnershipClock(snapshot.savedAt, now) || now - snapshot.savedAt > SNAPSHOT_MAX_AGE || !snapshot.pools || Object.keys(snapshot.pools).sort().join('|') !== [...leagueKeys].sort().join('|')) return false;
  return leagueKeys.every(key => {
    const pool = snapshot.pools[key];
    return pool?.complete === true && Array.isArray(pool.players) && pool.players.length <= 5025 &&
      new Set(pool.players.map(p => p?.key)).size === pool.players.length && pool.players.every(p =>
        /^\d+\.p\.\d+$/.test(p?.key || '') && ['name','team','position'].every(k => typeof p[k] === 'string' && p[k].length <= 150) &&
        [true,false,null].includes(p.owned) && [true,false,null].includes(p.isMine) && (p.ownershipType === null || typeof p.ownershipType === 'string' && p.ownershipType.length < 40) &&
        validOwnershipClock(Date.parse(p.checkedAt), now) && now - Date.parse(p.checkedAt) <= SNAPSHOT_MAX_AGE);
  });
}
async function cryptoKey(grant) { return crypto.subtle.importKey('raw', bytes(grant.key), 'AES-GCM', false, ['encrypt','decrypt']); }
export async function readOwnershipCache(grant, leagueKeys) {
  if (!validGrant(grant) || !globalThis.crypto?.subtle) return null;
  try {
    const entry = await dbOperation('readonly', store => store.get(grant.scope));
    if (!entry || entry.version !== 1 || typeof entry.body !== 'string' || entry.body.length > 8_000_000) return null;
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(entry.iv), additionalData: new TextEncoder().encode(grant.scope) }, await cryptoKey(grant), bytes(entry.body));
    const snapshot = JSON.parse(new TextDecoder().decode(plain));
    return validGrant(grant) && validSnapshot(snapshot, leagueKeys) ? snapshot : null;
  } catch { return null; }
}
export async function writeOwnershipCache(grant, pools, active = () => true) {
  if (!validGrant(grant) || !globalThis.crypto?.subtle || !active()) return false;
  try {
    const snapshot = { version: 1, savedAt: Date.now(), pools: compactPools(pools) };
    if (!validSnapshot(snapshot, Object.keys(pools))) return false;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(grant.scope) }, await cryptoKey(grant), new TextEncoder().encode(JSON.stringify(snapshot)));
    if (!active() || !validGrant(grant)) return false;
    await dbOperation('readwrite', store => { store.clear(); return store.put({ version: 1, iv: base64(iv), body: base64(encrypted) }, grant.scope); });
    if (!active()) { await clearOwnershipCache(); return false; }
    return true;
  } catch { return false; }
}

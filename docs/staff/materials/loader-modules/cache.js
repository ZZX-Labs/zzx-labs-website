// LocalStorage for raw MW responses + IndexedDB for render-ready pages (with memory fallback)

import { TTL_MS } from './config.js';

export function lsGet(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return null;
    if (Date.now() - (obj.t || 0) > TTL_MS) { localStorage.removeItem(key); return null; }
    return obj.v;
  } catch { return null; }
}

export function lsSet(key, value) {
  const payload = JSON.stringify({ t: Date.now(), v: value });
  try {
    localStorage.setItem(key, payload);
  } catch {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('mw:')) {
          try { const val = JSON.parse(localStorage.getItem(k)); keys.push({ k, t: val?.t || 0 }); }
          catch { keys.push({ k, t: 0 }); }
        }
      }
      keys.sort((a, b) => a.t - b.t);
      for (let i = 0; i < Math.min(5, keys.length); i++) localStorage.removeItem(keys[i].k);
      localStorage.setItem(key, payload);
    } catch {}
  }
}

/* ---------------- IndexedDB with graceful fallback ---------------- */

let _dbPromise = null;
let _idbAvailable = true;
const _memory = new Map();

function _touchRecord(obj) { try { if (obj && typeof obj === 'object') obj.t = Date.now(); } catch {} return obj; }

function openDB() {
  if (_dbPromise) return _dbPromise;
  if (!_idbAvailable) return Promise.resolve(null);

  _dbPromise = new Promise((resolve) => {
    let req;
    try { req = indexedDB.open('wiki_cache', 2); }
    catch { _idbAvailable = false; resolve(null); return; }

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('pages')) {
        const store = db.createObjectStore('pages', { keyPath: 'key' });
        store.createIndex('byTitle', 'title', { unique: false });
      } else {
        const store = req.transaction.objectStore('pages');
        if (!store.indexNames.contains('byTitle')) {
          store.createIndex('byTitle', 'title', { unique: false });
        }
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'k' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { _idbAvailable = false; resolve(null); };
    req.onblocked = () => {};
  });

  return _dbPromise;
}

async function _withDB(mode, fn) {
  const db = await openDB();
  if (!db) return fn(null);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['pages'], mode);
    const store = tx.objectStore('pages');
    Promise.resolve(fn(store, tx)).then(resolve).catch(reject);
    tx.onerror = () => reject(tx.error);
  });
}

/* ------------------------- Public IDB API --------------------------- */

export async function idbGet(key) {
  if (!_idbAvailable) return _memory.get(key) || null;
  try {
    return await _withDB('readonly', (store) => new Promise((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    }));
  } catch {
    _idbAvailable = false;
    return _memory.get(key) || null;
  }
}

export async function idbPut(obj) {
  const rec = _touchRecord(obj ? { ...obj } : obj);
  if (!_idbAvailable) { if (rec?.key) _memory.set(rec.key, rec); return true; }
  try {
    return await _withDB('readwrite', (store) => new Promise((resolve, reject) => {
      const req = store.put(rec);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    }));
  } catch {
    _idbAvailable = false;
    if (rec?.key) _memory.set(rec.key, rec);
    return true;
  }
}

export async function idbDelete(key) {
  if (!_idbAvailable) { _memory.delete(key); return true; }
  try {
    return await _withDB('readwrite', (store) => new Promise((resolve, reject) => {
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    }));
  } catch {
    _idbAvailable = false;
    _memory.delete(key);
    return true;
  }
}

export async function idbGetByTitle(title) {
  if (!_idbAvailable) {
    const out = [];
    for (const v of _memory.values()) if (v?.title === title) out.push(v);
    return out;
  }
  try {
    return await _withDB('readonly', (store) => new Promise((resolve, reject) => {
      const idx = store.index('byTitle');
      const req = idx.getAll(title);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    }));
  } catch {
    _idbAvailable = false;
    const out = [];
    for (const v of _memory.values()) if (v?.title === title) out.push(v);
    return out;
  }
}

/** Prune oldest records to keep size under maxEntries. */
export async function idbPrune(maxEntries = 300) {
  if (maxEntries <= 0) return 0;

  const collectAll = async () => {
    if (!_idbAvailable) return Array.from(_memory.values());
    try {
      return await _withDB('readonly', (store) => new Promise((resolve, reject) => {
        const out = [];
        const req = store.openCursor();
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) { out.push(cursor.value); cursor.continue(); }
          else resolve(out);
        };
        req.onerror = () => reject(req.error);
      }));
    } catch {
      _idbAvailable = false;
      return Array.from(_memory.values());
    }
  };

  const all = (await collectAll()) || [];
  if (all.length <= maxEntries) return 0;

  all.sort((a, b) => (a?.t || 0) - (b?.t || 0)); // oldest first
  const toRemove = all.length - maxEntries;
  let removed = 0;

  for (let i = 0; i < toRemove; i++) {
    const k = all[i]?.key;
    if (!k) continue;
    await idbDelete(k);
    removed++;
  }
  return removed;
}

export async function idbStats() {
  const result = { backend: _idbAvailable ? 'indexeddb' : 'memory', count: 0, oldest: null, newest: null };
  const list = _idbAvailable
    ? await _withDB('readonly', (store) => new Promise((resolve, reject) => {
        const out = [];
        const req = store.openCursor();
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) { out.push(cursor.value); cursor.continue(); }
          else resolve(out);
        };
        req.onerror = () => reject(req.error);
      }))
    : Array.from(_memory.values());

  const arr = list || [];
  result.count = arr.length;
  if (arr.length) {
    arr.sort((a, b) => (a?.t || 0) - (b?.t || 0));
    result.oldest = arr[0]?.t || null;
    result.newest = arr[arr.length - 1]?.t || null;
  }
  return result;
  }

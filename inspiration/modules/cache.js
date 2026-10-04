// /inspiration/modules/cache.js
// LocalStorage for raw MW payloads + IndexedDB for render-ready pages

import { TTL_MS } from './config.js';

/* ---------------- LocalStorage (TTL) ---------------- */
export function lsGet(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return null;
    if (Date.now() - (obj.t || 0) > TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return obj.v;
  } catch { return null; }
}

export function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify({ t: Date.now(), v: value }));
  } catch {
    // quota or private mode errors — noop
  }
}

/* ---------------- IndexedDB (pages store) ---------------- */
const HAS_IDB = typeof indexedDB !== 'undefined';
let _dbPromise = null;

// Minimal in-memory fallback if IDB is unavailable or fails
const _mem = new Map();

function openDB() {
  if (!HAS_IDB) return Promise.resolve(null);
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise((resolve) => {
    let resolved = false;
    let req;

    try {
      // IMPORTANT: omit version to open whatever is stored (avoids VersionError)
      req = indexedDB.open('wiki_cache');
    } catch {
      resolve(null);
      return;
    }

    req.onupgradeneeded = () => {
      // Only fires when DB is new or truly upgrading
      const db = req.result;
      if (!db.objectStoreNames.contains('pages')) {
        const store = db.createObjectStore('pages', { keyPath: 'key' });
        store.createIndex('byTitle', 'title', { unique: false });
      }
    };

    req.onsuccess = () => {
      resolved = true;
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };

    req.onerror = () => {
      // If we get a VersionError or any other error, just fall back to memory
      if (!resolved) resolve(null);
    };
  });

  return _dbPromise;
}

export async function idbGet(key) {
  const db = await openDB();
  if (!db) return _mem.get(key) || null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pages', 'readonly');
    const store = tx.objectStore('pages');
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function idbPut(obj) {
  if (!obj || !obj.key) throw new Error('idbPut: object must include a `key` field');
  const db = await openDB();
  if (!db) { _mem.set(obj.key, obj); return true; }
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pages', 'readwrite');
    tx.objectStore('pages').put(obj);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbDel(key) {
  const db = await openDB();
  if (!db) { _mem.delete(key); return true; }
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pages', 'readwrite');
    tx.objectStore('pages').delete(key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbClear() {
  const db = await openDB();
  if (!db) { _mem.clear(); return true; }
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pages', 'readwrite');
    tx.objectStore('pages').clear();
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

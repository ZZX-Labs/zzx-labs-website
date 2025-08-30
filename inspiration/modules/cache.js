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

// Minimal in-memory fallback if IDB is unavailable
const _mem = new Map();

function openDB() {
  if (!HAS_IDB) {
    // Fake a promise so callers can await safely
    return Promise.resolve(null);
  }
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open('wiki_cache', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('pages')) {
        const store = db.createObjectStore('pages', { keyPath: 'key' }); // key: title#fragment|ALL
        store.createIndex('byTitle', 'title', { unique: false });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });

  return _dbPromise;
}

export async function idbGet(key) {
  if (!HAS_IDB) return _mem.get(key) || null;
  const db = await openDB();
  if (!db) return null;
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
  if (!HAS_IDB) { _mem.set(obj.key, obj); return true; }
  const db = await openDB();
  if (!db) return false;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pages', 'readwrite');
    tx.objectStore('pages').put(obj);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/* Optional helpers (safe no-ops if unused) */
export async function idbDel(key) {
  if (!HAS_IDB) { _mem.delete(key); return true; }
  const db = await openDB();
  if (!db) return false;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pages', 'readwrite');
    tx.objectStore('pages').delete(key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbClear() {
  if (!HAS_IDB) { _mem.clear(); return true; }
  const db = await openDB();
  if (!db) return false;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pages', 'readwrite');
    tx.objectStore('pages').clear();
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/*
 * ZZX-BLOG — deterministic, canonical article artwork allocator.
 * File: /blog/hero-art.js
 * Source: /blog/hero-assignments.json
 *
 * Different articles never share an approved image path. An article keeps the
 * same cover on Journal, Archive, RSS, and post pages, regardless of load order.
 * No stock image is chosen at random. This module does not modify the artwork.
 *
 * Public API:
 *   await window.ZZXHero.normalize(posts)
 *   await window.ZZXHero.load()
 *   window.ZZXHero.reload()       // after publishing/changing assignments
 */
(function (global) {
  'use strict';

  const MANIFEST_URL = '/blog/hero-assignments.json';
  const HERO_PREFIX = '/assets/hero/';
  const DEFAULT_MANIFEST = { by_url: {}, images: [] };

  let cache = null;
  let pending = null;
  let revision = 0;

  function urlKey(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
      const url = new URL(value.trim(), global.location.origin);
      if (url.origin !== global.location.origin) return '';
      let path = decodeURI(url.pathname).replace(/\/{2,}/g, '/');
      path = path.replace(/\/index\.html?$/i, '').replace(/\/+$/, '');
      return path || '/';
    } catch (_error) {
      return '';
    }
  }

  function safeHeroPath(value) {
    if (typeof value !== 'string' || !value.startsWith(HERO_PREFIX)) return '';
    if (!/^\/assets\/hero\/[a-zA-Z0-9][a-zA-Z0-9_.-]*\.png$/.test(value)) return '';
    if (value.includes('..')) return '';
    return value;
  }

  function readableAlt(post, record) {
    if (typeof record.alt === 'string' && record.alt.trim()) return record.alt.trim();
    const title = typeof post.title === 'string' && post.title.trim()
      ? post.title.trim() : (typeof record.title === 'string' ? record.title.trim() : 'article');
    return `ZZX-Labs editorial illustration for ${title}`;
  }

  function buildAssignments(manifest) {
    const byUrl = manifest && typeof manifest.by_url === 'object' && manifest.by_url
      && !Array.isArray(manifest.by_url) ? manifest.by_url : {};

    const approved = new Set(
      (Array.isArray(manifest.images) ? manifest.images : [])
        .filter((entry) => entry && entry.publication_approved === true)
        .map((entry) => safeHeroPath(entry.path))
        .filter(Boolean)
    );

    // A deterministic pre-pass enforces unique owners for the *entire* manifest.
    // Ownership is not affected by which page or which slice renders first.
    const hasImageRegistry = Array.isArray(manifest.images) && manifest.images.length > 0;
    const claims = new Map();
    const owners = new Map();
    for (const [rawURL, record] of Object.entries(byUrl)) {
      const key = urlKey(rawURL);
      const path = record && safeHeroPath(record.path);
      if (!key || key === '/' || !path) continue;
      if (hasImageRegistry && !approved.has(path)) continue;
      if (!hasImageRegistry && record.publication_approved !== true
          && record.source !== 'original-procedural-art') continue;
      if (record.publication_approved === false) continue;
      const claim = { key, path, record };
      claims.set(key, claim);
      const currentOwner = owners.get(path);
      if (!currentOwner || key.localeCompare(currentOwner) < 0) owners.set(path, key);
    }

    const assignments = new Map();
    for (const [key, claim] of claims) {
      if (owners.get(claim.path) === key) assignments.set(key, claim);
    }
    return { assignments, reservedPaths: new Set(owners.keys()), approved };
  }

  async function load() {
    if (cache) return cache;
    if (pending) return pending;
    const issuedRevision = revision;
    pending = (async () => {
      try {
        const response = await global.fetch(MANIFEST_URL, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!data || typeof data !== 'object' || !data.by_url
            || typeof data.by_url !== 'object') throw new Error('Invalid hero manifest');
        const compiled = buildAssignments(data);
        const result = { manifest: data, ...compiled, available: true };
        if (issuedRevision === revision) cache = result;
        return result;
      } catch (_error) {
        // A transient HTTP failure must not permanently poison the cache.
        return { manifest: DEFAULT_MANIFEST, ...buildAssignments(DEFAULT_MANIFEST), available: false };
      } finally {
        if (issuedRevision === revision) pending = null;
      }
    })();
    return pending;
  }

  function reload() {
    revision += 1;
    cache = null;
    pending = null;
  }

  function canonicalLocalFallback(post, key) {
    // Offline fallback only for uniquely named ZZX article artwork. A generic
    // thumb or stock image never becomes publication-approved by accident.
    const slug = key.split('/').filter(Boolean).pop() || '';
    const expected = safeHeroPath(`${HERO_PREFIX}zzx-post-${slug}.png`);
    const fromPost = safeHeroPath(post.thumb || post.image || '');
    if (!expected || !fromPost || expected !== fromPost) return '';
    return expected;
  }

  async function normalize(posts) {
    if (!Array.isArray(posts)) return [];
    const { assignments, reservedPaths, available } = await load();
    const fallbackOwners = new Map();
    if (!available) {
      for (const post of posts) {
        if (!post || typeof post !== 'object') continue;
        const key = urlKey(post.url || post.href || '');
        const path = key ? canonicalLocalFallback(post, key) : '';
        if (!path) continue;
        const owner = fallbackOwners.get(path);
        if (!owner || key.localeCompare(owner) < 0) fallbackOwners.set(path, key);
      }
    }

    // The manifest always takes priority over ad-hoc card thumbnails.
    // Fallbacks are URL-derived (not first-come-first-served) and cannot take
    // a path reserved to another article by the manifest.
    return posts.map((post) => {
      if (!post || typeof post !== 'object' || Array.isArray(post)) return post;
      const result = { ...post };
      const key = urlKey(post.url || post.href || '');
      const assigned = assignments.get(key);

      if (assigned) {
        result.thumb = assigned.path;
        result.image = assigned.path;
        result.hero_alt = readableAlt(post, assigned.record);
        return result;
      }

      const fallback = key && key !== '/' ? canonicalLocalFallback(post, key) : '';
      if (!available && fallback && !reservedPaths.has(fallback)
          && fallbackOwners.get(fallback) === key) {
        result.thumb = fallback;
        result.image = fallback;
        result.hero_alt = typeof post.hero_alt === 'string' && post.hero_alt.trim()
          ? post.hero_alt.trim() : readableAlt(post, {});
      } else {
        result.thumb = '';
        result.image = '';
        result.hero_alt = '';
      }
      return result;
    });
  }

  global.ZZXHero = Object.freeze({ normalize, load, reload, urlKey });
})(window);

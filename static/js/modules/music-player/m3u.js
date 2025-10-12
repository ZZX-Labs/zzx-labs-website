// static/js/modules/music-player/m3u.js
// Parse and load .m3u playlists for both local tracks and radio stations.

import { isAbs, join, parseM3U } from './utils.js';
import { fetchText } from './utils.js';

/**
 * Load a .m3u file and return a normalized track list.
 * @param {string} path - .m3u path relative to manifest or absolute URL
 * @param {boolean} isStation - Whether this M3U represents a live station
 * @param {object|null} stationMeta - Metadata for the station (if any)
 * @param {object} cfg - Player config (audioBase, manifestUrl, etc.)
 * @param {object} opts - { shuffle?: boolean }
 * @returns {Promise<Array>} tracks
 */
export async function loadM3U(path, isStation, stationMeta, cfg, opts = {}) {
  const base = cfg.manifestUrl.replace(/\/manifest\.json$/i, '');
  const url = isAbs(path) ? path : join(base, path);
  const txt = await fetchText(url);
  const entries = parseM3U(txt);
  if (!entries.length) return [];

  if (isStation) {
    return [{
      title: stationMeta?.title || 'Live Station',
      isStream: true,
      urls: entries.map(e => isAbs(e.url) ? e.url : join(cfg.audioBase, e.url)),
      kind: stationMeta?.kind || stationMeta?.meta?.kind,
      meta: stationMeta?.meta || stationMeta
    }];
  }

  // Playlist (non-stream)
  let tracks = entries.map(e => ({
    title: e.title || e.url,
    url: isAbs(e.url) ? e.url : join(cfg.audioBase, e.url),
    isStream: false
  }));

  if (opts.shuffle && tracks.length > 1) {
    for (let i = tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
    }
  }

  return tracks;
}

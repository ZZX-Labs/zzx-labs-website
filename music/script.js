// /music/script.js (only the relevant diffs)

// add updateRadioListeners to imports from ui.js
import {
  buildShell,
  setNow,
  renderPlaylistList,
  renderRadioList,
  updateRadioNow,
  updateRadioListeners,   // <-- add this
  highlightList,
  fillSelect
} from './modules/ui.js';

// remove any fetchStreamMetaUniversal code if present

// ...keep everything else (playback, m3u loading, etc.) the same...

/* ---------- Live metadata polling (SomaFM only) ---------- */
function stopMetaPolling(){ if (metaTimer) { clearInterval(metaTimer); metaTimer = null; } }
function startMetaPolling(refs, stationTitle){
  stopMetaPolling();
  if (!lastStreamUrl) return;
  pollOnce(refs, stationTitle); // immediate
  metaTimer = setInterval(()=> pollOnce(refs, stationTitle), Math.max(5, cfg.metaPollSec)*1000);
}

async function pollOnce(refs, stationTitle){
  try {
    // SomaFM-only: channels.json -> { id, title, listeners, now }
    const meta = await fetchStreamMeta(lastStreamUrl, cfg.corsProxy, { name: stationTitle });
    if (!meta) return;

    // 1) listeners → left of LIVE (row 0 right cell)
    if (typeof meta.listeners === 'number' && meta.listeners !== lastListeners){
      lastListeners = meta.listeners;
      updateRadioListeners(refs, lastListeners);
    }

    // 2) lastPlaying → row beneath station (row #1, left cell)
    const label = (meta.now || meta.title || '').trim();
    if (label && label !== lastNowTitle){
      lastNowTitle = label;
      setNow(refs, stationTitle || meta.title || 'Live Station', 'Radio');
      updateRadioNow(refs, label);
      appendStationHistory(stationTitle || meta.title || 'Live Station', label);
    }
  } catch {}
}

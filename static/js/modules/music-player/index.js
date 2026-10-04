// static/js/modules/music-player/index.js
// Entry: export mount() and auto-mount a single player if [data-mp] exists.

import { mount } from './mount.js';

export { mount };

// Auto-mount first [data-mp] on the page (back-compat with previous build)
const autoRoot = document.querySelector('[data-mp]');
if (autoRoot) {
  // You can override via data-* attributes on the element. See mount.js for options.
  mount(autoRoot);
}

// Optional: expose to window for quick manual mounting / debugging
//   window.MusicPlayer.mount(document.querySelector('#someEl'), { autoplay: true })
if (typeof window !== 'undefined') {
  window.MusicPlayer = Object.assign(window.MusicPlayer || {}, { mount });
}

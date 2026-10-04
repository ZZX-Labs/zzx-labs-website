// /docs/staff/materials/loader-modules/loader.js
// One entrypoint to rule them all.

import * as Config from './config.js';
import * as Utils from './utils.js';
import * as Cache from './cache.js';
import * as MW from './mw.js';
import * as Render from './render.js';
import { boot as _boot } from './app.js';

/** Version tag (bump manually when you update loader set) */
export const VERSION = 'v2.0.0';

/** Primary entrypoint used by all resource pages */
export const boot = _boot;

/** Structured re-exports for power users / debugging */
export { Config, Utils, Cache, MW, Render };

/** Named passthroughs (tree-shakable) */
export * from './config.js';
export * from './utils.js';
export * from './cache.js';
export * from './mw.js';
export * from './render.js';

/** Optional: expose a safe debug handle (no side effects for SSR) */
if (typeof window !== 'undefined') {
  window.zzxMaterials ??= Object.freeze({
    VERSION,
    boot,
    Config,
    Utils,
    Cache,
    MW,
    Render
  });
}

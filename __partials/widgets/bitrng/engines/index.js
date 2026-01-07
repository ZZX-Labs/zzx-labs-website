// __partials/widgets/bitrng/engines/index.js
"use strict";

import { engineHashSHA256 } from "./hash-sha256.js";
import { enginePolyhedra } from "./polyhedra.js";

const ENGINES = new Map([
  [engineHashSHA256.id, engineHashSHA256],
  [enginePolyhedra.id, enginePolyhedra],
]);

export function listEngines() {
  return Array.from(ENGINES.values()).map(e => ({
    id: e.id,
    title: e.title,
    modes: e.modes,
  }));
}

export function getEngine(id) {
  return ENGINES.get(String(id)) || null;
}

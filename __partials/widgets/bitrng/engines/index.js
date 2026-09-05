// __partials/widgets/bitrng/engines/index.js
"use strict";

import { engineRaw } from "./raw.js";
import { engineHashSHA256 } from "./hash-sha256.js";
import { enginePolyhedra } from "./polyhedra.js";

const ENGINES = new Map([
  [engineRaw.id, engineRaw],
  [engineHashSHA256.id, engineHashSHA256],
  [enginePolyhedra.id, enginePolyhedra]
]);

export function listEngines() {
  return Array.from(ENGINES.values()).map((engine) => ({
    id: engine.id,
    title: engine.title,
    modes: Array.isArray(engine.modes) ? [...engine.modes] : ["default"]
  }));
}

export function getEngine(id) {
  return ENGINES.get(String(id || "")) || null;
}

/* Source-backed water selection. Land boundaries and the globe renderer stay independent. */
(function () {
  "use strict";
  const MAX_FEATURES = 100000;
  const RAD = Math.PI / 180;
  const base = "boundaries/water/";
  const opened = new Map();
  const manifests = new Map();
  const wrap = angle => ((angle + 540) % 360 + 360) % 360 - 180;

  async function json(root, path) {
    const response = await fetch(new URL(base + path, root));
    if (!response.ok) throw Error(`Water boundary HTTP ${response.status}: ${path}`);
    return response.json();
  }
  function ringContains(ring, lon, lat) {
    // Unwrap each segment relative to the previous vertex, so date-line rings
    // retain their intended shape on both sides of 180 degrees.
    let inside = false, previous = null;
    for (const [longitude, latitude] of ring) {
      const x = previous ? previous[0] + wrap(longitude - previous[2]) : wrap(longitude - lon);
      if (previous && (latitude > lat) !== (previous[1] > lat) &&
          0 < (x - previous[0]) * (lat - previous[1]) / (latitude - previous[1]) + previous[0]) {
        inside = !inside;
      }
      previous = [x, latitude, longitude];
    }
    return inside;
  }
  function polygonContains(groups, lon, lat) {
    for (const paths of groups) {
      if (!paths[0] || !ringContains(paths[0], lon, lat)) continue;
      if (!paths.slice(1).some(hole => ringContains(hole, lon, lat))) return true;
    }
    return false;
  }
  function lineDistance(groups, x, y, project, width) {
    let nearest = Infinity;
    for (const paths of groups) for (const line of paths) {
      let previous = null;
      for (const [lon, lat] of line) {
        const point = project({lon, lat});
        if (point && previous && Math.abs(point.x - previous.x) < width * .18) {
          const dx = point.x - previous.x, dy = point.y - previous.y;
          const fraction = Math.max(0, Math.min(1,
            ((x - previous.x) * dx + (y - previous.y) * dy) / (dx * dx + dy * dy || 1)));
          nearest = Math.min(nearest, Math.hypot(x - previous.x - fraction * dx,
                                                 y - previous.y - fraction * dy));
        }
        previous = point;
      }
    }
    return nearest;
  }
  function angularSize(feature) {
    const b = feature.bbox;
    return Math.abs((b[2] - b[0]) * (b[3] - b[1]));
  }

  async function open(root, year) {
    if (!manifests.has(root)) manifests.set(root, json(root, "manifest.json"));
    const manifest = await manifests.get(root);
    if (manifest.schema !== "zzx-water-boundaries-v1") throw Error("Unknown water boundary version");
    const dated = manifest.editions?.[String(year)];
    const relative = dated || manifest.reference;
    if (!relative || !/^(reference|editions\/\d{4})\/index\.json$/.test(relative)) {
      throw Error("No water boundary index installed");
    }
    const cacheKey = `${root}|${relative}`;
    if (opened.has(cacheKey)) return opened.get(cacheKey);
    const promise = loadIndex(root, relative, Boolean(dated));
    opened.set(cacheKey, promise);
    return promise;
  }
  async function loadIndex(root, relative, historical) {
    const index = await json(root, relative);
    if (index.schema !== 1 || !Array.isArray(index.indexes)) throw Error("Invalid water index");
    const prefix = relative.slice(0, relative.lastIndexOf("/") + 1);
    const indexes = await Promise.all(index.indexes.map(part => json(root, prefix + part)));
    const features = indexes.flatMap(part => part.features || []);
    if (features.length !== index.features || features.length > MAX_FEATURES) {
      throw Error("Incomplete water feature index");
    }
    const sources = new Map(index.sources.map(source => [source.id, source]));
    const shardCache = new Map();
    const geometryCache = new Map();
    async function geometry(feature) {
      if (geometryCache.has(feature.id)) return geometryCache.get(feature.id);
      const promise = (async () => {
        const shards = await Promise.all(feature.parts.map(part => {
          if (!/^geometry\/part-\d{4}\.json$/.test(part)) throw Error("Invalid water shard path");
          if (!shardCache.has(part)) shardCache.set(part, json(root, prefix + part));
          return shardCache.get(part);
        }));
        const groups = new Map();
        for (const shard of shards) for (const [id, group, path, start, points] of shard.records) {
          if (id !== feature.id) continue;
          if (!groups.has(group)) groups.set(group, new Map());
          const paths = groups.get(group);
          if (!paths.has(path)) paths.set(path, []);
          paths.get(path).push([start, points]);
        }
        return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([, paths]) =>
          [...paths.entries()].sort((a, b) => a[0] - b[0]).map(([, pieces]) =>
            pieces.sort((a, b) => a[0] - b[0]).flatMap(([, points]) => points)));
      })();
      geometryCache.set(feature.id, promise);
      return promise;
    }
    async function hit(lon, lat, x, y, project, width, height, zoom, land) {
      // Bounding boxes only reject candidates; exact polygon and screen-space
      // line tests use the unabridged source geometry in bounded local shards.
      const radius = Math.min(width, height) * .4;
      const margin = Math.min(20, 14 * Math.max(1 / (radius * RAD),
        180 / height, 360 / width) / zoom);
      const lonMargin = Math.min(40, margin / Math.max(.15, Math.cos(lat * RAD)));
      const candidates = features.filter(feature => {
        const b = feature.bbox;
        if (lat < b[1] - margin || lat > b[3] + margin) return false;
        return b[2] - b[0] > 180 ||
          (lon >= b[0] - lonMargin && lon <= b[2] + lonMargin) ||
          (lon + 360 >= b[0] - lonMargin && lon + 360 <= b[2] + lonMargin) ||
          (lon - 360 >= b[0] - lonMargin && lon - 360 <= b[2] + lonMargin);
      });
      const inland = candidates.filter(f => f.geometry === "polygon" &&
        sources.get(f.source)?.kind === "lakes");
      const rivers = candidates.filter(f => f.geometry === "line" && f.kind !== "lake centerline");
      const centerlines = candidates.filter(f => f.geometry === "line" && f.kind === "lake centerline");
      const marine = land ? [] : candidates.filter(f => sources.get(f.source)?.kind === "marine");
      for (const group of [inland, rivers, centerlines, marine]) {
        if (!group.length) continue;
        const results = await Promise.all(group.map(async feature => {
          const paths = await geometry(feature);
          const distance = feature.geometry === "polygon"
            ? polygonContains(paths, lon, lat) ? 0 : Infinity
            : lineDistance(paths, x, y, project, width);
          return {feature, paths, distance};
        }));
        const matched = results.filter(result => result.distance <=
          (result.feature.geometry === "line" ? 7 : 0));
        if (matched.length) {
          matched.sort((a, b) => a.distance - b.distance ||
            angularSize(a.feature) - angularSize(b.feature));
          return matched[0];
        }
      }
      return null;
    }
    return {index, features, sources, historical, geometry, hit};
  }

  window.WFBWaterBoundaries = Object.freeze({open, ringContains, polygonContains});
})();

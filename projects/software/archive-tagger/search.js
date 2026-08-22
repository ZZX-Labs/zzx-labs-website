(() => {
  "use strict";

  const STOP = new Set(
    "a an and are as at be by for from in into is it of on or that the this to with".split(" ")
  );

  function tokens(value) {
    return String(value || "")
      .toLowerCase()
      .match(/[a-z0-9][a-z0-9_.:+-]{1,}/g)?.filter(t => !STOP.has(t)) || [];
  }

  function scoreRecord(record, queryTokens, tagsOnly = false) {
    if (!queryTokens.length) return 0;

    const tags = new Set((record.tags || []).map(t => t.toLowerCase()));
    if (tagsOnly) {
      let score = 0;
      for (const q of queryTokens) {
        if (tags.has(q)) score += 6;
        else if ([...tags].some(tag => tag.includes(q))) score += 3;
      }
      return score;
    }

    const name = String(record.name || "").toLowerCase();
    const text = String(record.text || "").toLowerCase();
    const meta = JSON.stringify(record.metadata || {}).toLowerCase();
    const mime = `${record.type || ""} ${record.extension || ""} ${record.category || ""}`.toLowerCase();

    let score = 0;
    for (const q of queryTokens) {
      if (name.includes(q)) score += 8;
      if (tags.has(q)) score += 7;
      if ([...tags].some(tag => tag.includes(q))) score += 4;
      if (mime.includes(q)) score += 3;
      if (meta.includes(q)) score += 2;

      const first = text.indexOf(q);
      if (first >= 0) {
        score += 1;
        const occurrences = text.split(q).length - 1;
        score += Math.min(4, occurrences * .25);
      }
    }
    return score;
  }

  function snippet(record, queryTokens, max = 360) {
    const text = String(record.text || "");
    if (!text) return "";

    const lower = text.toLowerCase();
    let pos = -1;
    for (const q of queryTokens) {
      const p = lower.indexOf(q);
      if (p >= 0 && (pos < 0 || p < pos)) pos = p;
    }

    if (pos < 0) return text.slice(0,max) + (text.length > max ? "…" : "");
    const start = Math.max(0, pos - Math.floor(max/3));
    const end = Math.min(text.length, start + max);
    return `${start > 0 ? "…" : ""}${text.slice(start,end)}${end < text.length ? "…" : ""}`;
  }

  class ArchiveTaggerSearch {
    search(records, query, options = {}) {
      const q = tokens(query);
      if (!q.length) return [];

      return records
        .map(record => ({
          record,
          score: scoreRecord(record, q, Boolean(options.tagsOnly)),
          snippet: snippet(record, q)
        }))
        .filter(x => x.score > 0)
        .sort((a,b) => b.score - a.score || a.record.name.localeCompare(b.record.name));
    }
  }

  window.ArchiveTaggerSearch = ArchiveTaggerSearch;
})();

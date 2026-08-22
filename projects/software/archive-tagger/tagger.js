(() => {
  "use strict";

  const STORAGE = "zzx-archivetagger-taxonomy-v1";

  const DEFAULT_RULES = [
    { tag: "document", keywords: ["pdf","doc","docx","odt","txt","md","rtf"] },
    { tag: "image", keywords: ["image/","png","jpg","jpeg","gif","webp","photo","diagram","scan"] },
    { tag: "audio", keywords: ["audio/","mp3","wav","flac","ogg","podcast","recording"] },
    { tag: "video", keywords: ["video/","mp4","webm","mov","mkv","footage"] },
    { tag: "archive", keywords: ["zip","tar","7z","rar","archive","backup"] },
    { tag: "dataset", keywords: ["csv","tsv","json","jsonl","parquet","dataset","corpus"] },
    { tag: "code", keywords: ["javascript","python","kotlin","java","source code","github","script"] },
    { tag: "research", keywords: ["research","paper","abstract","citation","bibliography","doi","journal"] },
    { tag: "metadata", keywords: ["metadata","exif","manifest","index","catalog"] }
  ];

  function norm(value) {
    return String(value || "").toLowerCase();
  }

  class ArchiveTaggerTaxonomy {
    constructor() {
      this.rules = [];
      this.load();
    }

    load() {
      try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE) || "null");
        this.rules = Array.isArray(parsed) ? parsed : DEFAULT_RULES.map(r => ({...r}));
      } catch {
        this.rules = DEFAULT_RULES.map(r => ({...r}));
      }
    }

    save() {
      localStorage.setItem(STORAGE, JSON.stringify(this.rules));
    }

    resetDefaults() {
      this.rules = DEFAULT_RULES.map(r => ({...r}));
      this.save();
    }

    clear() {
      this.rules = [];
      this.save();
    }

    add(tag, keywords) {
      const cleanTag = String(tag || "").trim().toLowerCase();
      if (!cleanTag) throw new Error("Tag is required.");

      const words = Array.isArray(keywords)
        ? keywords
        : String(keywords || "").split(",");

      const clean = [...new Set(words.map(x => x.trim().toLowerCase()).filter(Boolean))];
      if (!clean.length) throw new Error("At least one keyword is required.");

      const existing = this.rules.find(r => r.tag === cleanTag);
      if (existing) existing.keywords = [...new Set([...existing.keywords, ...clean])];
      else this.rules.push({ tag: cleanTag, keywords: clean });

      this.save();
    }

    remove(tag) {
      this.rules = this.rules.filter(r => r.tag !== tag);
      this.save();
    }

    apply(record) {
      const haystack = norm([
        record.name,
        record.type,
        record.extension,
        record.category,
        record.text || "",
        JSON.stringify(record.metadata || {})
      ].join("\n"));

      const tags = new Set(record.tags || []);
      tags.add(record.category);

      for (const rule of this.rules) {
        if (rule.keywords.some(k => haystack.includes(norm(k)))) {
          tags.add(rule.tag);
        }
      }

      return [...tags].filter(Boolean).sort();
    }
  }

  window.ArchiveTaggerTaxonomy = ArchiveTaggerTaxonomy;
})();

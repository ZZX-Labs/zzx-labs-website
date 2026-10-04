(() => {
  "use strict";

  function uid() {
    return crypto.randomUUID
      ? crypto.randomUUID()
      : `at-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  class ArchiveTaggerCore {
    constructor({ store, taxonomy, search, ocr }) {
      this.store = store;
      this.taxonomy = taxonomy;
      this.searchEngine = search;
      this.ocr = ocr;

      this.records = [];
      this.fileHandles = new Map();
      this.cancelled = false;
    }

    async restore() {
      this.records = await this.store.all();
      return this.records;
    }

    publicRecord(record) {
      const {
        _file,
        ...clean
      } = record;
      return JSON.parse(JSON.stringify(clean));
    }

    async processFile(file, options = {}) {
      const id = uid();
      const metadata = await ArchiveTaggerMetadata.extract(file);
      const hash = await ArchiveTaggerMetadata.sha256(file);

      const record = {
        id,
        name: file.name,
        size: file.size,
        type: file.type || metadata.type,
        extension: metadata.extension,
        category: metadata.category,
        lastModified: metadata.lastModified,
        lastModifiedIso: metadata.lastModifiedIso,
        sha256: hash,
        perceptualHash: metadata.perceptualHash || null,
        tags: [],
        text: metadata.text || "",
        textTruncated: Boolean(metadata.truncated),
        metadata: {
          ...metadata
        },
        source: options.source || "local-file",
        sourceUrl: options.sourceUrl || null,
        indexedAt: new Date().toISOString()
      };

      // Avoid duplicating large text inside metadata.
      delete record.metadata.text;

      record.tags = this.taxonomy.apply(record);

      this.records.push(record);
      this.fileHandles.set(id, file);
      await this.store.put(this.publicRecord(record));

      return record;
    }

    async processFiles(files, callbacks = {}) {
      this.cancelled = false;
      const list = [...files];
      let processed = 0;
      let errors = 0;

      for (let i = 0; i < list.length; i++) {
        if (this.cancelled) break;
        const file = list[i];

        try {
          callbacks.onStart?.(file, i, list.length);
          const record = await this.processFile(file);
          processed++;
          callbacks.onRecord?.(record, i, list.length);
        } catch (error) {
          errors++;
          callbacks.onError?.(file, error, i, list.length);
        }

        callbacks.onProgress?.({
          index: i + 1,
          total: list.length,
          processed,
          errors
        });
      }

      return { processed, errors, cancelled: this.cancelled };
    }

    cancel() {
      this.cancelled = true;
    }

    clearSessionFiles() {
      this.fileHandles.clear();
    }

    fileFor(id) {
      return this.fileHandles.get(id) || null;
    }

    get(id) {
      return this.records.find(r => r.id === id) || null;
    }

    async update(record) {
      const index = this.records.findIndex(r => r.id === record.id);
      if (index < 0) throw new Error("Record not found.");
      this.records[index] = record;
      await this.store.put(this.publicRecord(record));
      return record;
    }

    async delete(id) {
      this.records = this.records.filter(r => r.id !== id);
      this.fileHandles.delete(id);
      await this.store.delete(id);
    }

    async clear() {
      this.records = [];
      this.fileHandles.clear();
      await this.store.clear();
    }

    async applyTaxonomyAll() {
      for (const record of this.records) {
        record.tags = this.taxonomy.apply(record);
      }
      await this.store.putMany(this.records.map(r => this.publicRecord(r)));
    }

    search(query, options) {
      return this.searchEngine.search(this.records, query, options);
    }

    duplicateAnalysis() {
      const groups = new Map();
      for (const record of this.records) {
        if (!groups.has(record.sha256)) groups.set(record.sha256, []);
        groups.get(record.sha256).push(record);
      }

      const exact = [...groups.entries()]
        .filter(([,items]) => items.length > 1)
        .map(([sha256,items]) => ({ sha256, items }));

      const images = this.records.filter(r => r.category === "image" && r.perceptualHash);
      const near = [];
      const seenPairs = new Set();

      for (let i = 0; i < images.length; i++) {
        for (let j = i+1; j < images.length; j++) {
          const a = images[i], b = images[j];
          if (a.sha256 === b.sha256) continue;
          const d = ArchiveTaggerMetadata.hammingHex(a.perceptualHash, b.perceptualHash);
          if (d <= 6) {
            const key = [a.id,b.id].sort().join(":");
            if (!seenPairs.has(key)) {
              seenPairs.add(key);
              near.push({ a, b, distance: d });
            }
          }
        }
      }

      near.sort((x,y) => x.distance - y.distance);
      return { exact, near };
    }

    async runOCR(id) {
      const record = this.get(id);
      if (!record) throw new Error("Record not found.");
      if (record.category !== "image") throw new Error("OCR currently targets image records.");
      const file = this.fileFor(id);
      if (!file) throw new Error("Original file is no longer available in this browser session.");

      const text = await this.ocr.recognize(file, { record: this.publicRecord(record) });
      record.text = text;
      record.metadata.ocrProvider = this.ocr.name || "custom";
      record.metadata.ocrAt = new Date().toISOString();
      record.metadata.ocrChars = text.length;
      record.tags = this.taxonomy.apply(record);
      await this.update(record);
      return text;
    }

    exportCatalog() {
      return {
        schema: "zzx.archivetagger.catalog.v1",
        exportedAt: new Date().toISOString(),
        records: this.records.map(r => this.publicRecord(r)),
        taxonomy: this.taxonomy.rules
      };
    }

    async importCatalog(value) {
      if (!value || value.schema !== "zzx.archivetagger.catalog.v1" || !Array.isArray(value.records)) {
        throw new Error("Unsupported ArchiveTagger catalog JSON.");
      }
      this.records = value.records.map(r => ({
        ...r,
        tags: Array.isArray(r.tags) ? r.tags : [],
        text: String(r.text || ""),
        metadata: r.metadata || {}
      }));
      if (Array.isArray(value.taxonomy)) {
        this.taxonomy.rules = value.taxonomy;
        this.taxonomy.save();
      }
      await this.store.clear();
      await this.store.putMany(this.records);
      return this.records.length;
    }
  }

  window.ArchiveTaggerCore = ArchiveTaggerCore;
})();

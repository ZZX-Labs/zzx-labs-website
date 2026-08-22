(() => {
  "use strict";

  const STOP = new Set(
    "a an and are as at be been but by can could did do does for from had has have he her hers him his how i if in into is it its may me more most my no not of on one or our ours she should so some such than that the their them then there these they this those to too up us was we were what when where which who why will with would you your yours".split(" ")
  );

  function uid() {
    return crypto.randomUUID
      ? crypto.randomUUID()
      : `doc-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalize(text) {
    return String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/\u0000/g, "")
      .trim();
  }

  function tokenize(text) {
    return normalize(text)
      .toLowerCase()
      .match(/[a-z0-9][a-z0-9'_-]{1,}/g)?.filter((t) => !STOP.has(t)) || [];
  }

  function splitParagraphs(text) {
    return normalize(text)
      .split(/\n\s*\n+/)
      .map((p) => p.trim())
      .filter(Boolean);
  }

  function chunkText(text, maxChars = 900) {
    const paragraphs = splitParagraphs(text);
    const chunks = [];
    let buffer = "";

    function push() {
      const value = buffer.trim();
      if (value) chunks.push(value);
      buffer = "";
    }

    for (const paragraph of paragraphs) {
      if (paragraph.length > maxChars * 1.5) {
        push();
        const sentences = paragraph.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [paragraph];
        for (const sentenceRaw of sentences) {
          const sentence = sentenceRaw.trim();
          if ((buffer + " " + sentence).trim().length > maxChars && buffer) push();
          buffer = `${buffer} ${sentence}`.trim();
        }
        push();
        continue;
      }

      if ((buffer + "\n\n" + paragraph).trim().length > maxChars && buffer) push();
      buffer = `${buffer}\n\n${paragraph}`.trim();
    }

    push();
    return chunks;
  }

  function termCounts(tokens) {
    const map = new Map();
    for (const token of tokens) map.set(token, (map.get(token) || 0) + 1);
    return map;
  }

  class AlexBerossusCorpus {
    constructor() {
      this.documents = [];
      this.chunks = [];
      this.df = new Map();
      this.avgLength = 1;
    }

    addDocument({ title, text, source = "manual", metadata = {} }) {
      const clean = normalize(text);
      if (!clean) throw new Error("Source text is empty.");

      const doc = {
        id: uid(),
        title: String(title || "Untitled source").trim() || "Untitled source",
        text: clean,
        source,
        metadata,
        addedAt: new Date().toISOString()
      };

      this.documents.push(doc);
      return doc;
    }

    removeDocument(id) {
      this.documents = this.documents.filter((doc) => doc.id !== id);
      this.rebuild();
    }

    clear() {
      this.documents = [];
      this.chunks = [];
      this.df.clear();
      this.avgLength = 1;
    }

    rebuild(maxChars = 900) {
      this.chunks = [];
      this.df.clear();

      for (const doc of this.documents) {
        const pieces = chunkText(doc.text, maxChars);

        pieces.forEach((text, index) => {
          const tokens = tokenize(text);
          const counts = termCounts(tokens);
          const chunk = {
            id: `${doc.id}:${index}`,
            documentId: doc.id,
            documentTitle: doc.title,
            index,
            text,
            tokens,
            counts,
            length: Math.max(1, tokens.length)
          };
          this.chunks.push(chunk);

          for (const token of new Set(tokens)) {
            this.df.set(token, (this.df.get(token) || 0) + 1);
          }
        });
      }

      this.avgLength = this.chunks.length
        ? this.chunks.reduce((sum, chunk) => sum + chunk.length, 0) / this.chunks.length
        : 1;

      return this.chunks.length;
    }

    search(query, limit = 6) {
      const qTokens = tokenize(query);
      if (!qTokens.length || !this.chunks.length) return [];

      const N = this.chunks.length;
      const k1 = 1.5;
      const b = 0.75;

      const scored = this.chunks.map((chunk) => {
        let score = 0;

        for (const term of qTokens) {
          const tf = chunk.counts.get(term) || 0;
          if (!tf) continue;

          const df = this.df.get(term) || 0;
          const idf = Math.log(1 + (N - df + .5) / (df + .5));
          const denom = tf + k1 * (1 - b + b * chunk.length / this.avgLength);
          score += idf * ((tf * (k1 + 1)) / denom);
        }

        return { chunk, score };
      });

      return scored
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((x) => ({
          score: x.score,
          documentId: x.chunk.documentId,
          documentTitle: x.chunk.documentTitle,
          chunkId: x.chunk.id,
          index: x.chunk.index,
          text: x.chunk.text
        }));
    }

    stats() {
      return {
        documents: this.documents.length,
        chunks: this.chunks.length,
        characters: this.documents.reduce((sum, doc) => sum + doc.text.length, 0),
        uniqueTerms: this.df.size
      };
    }

    export() {
      return {
        schema: "zzx.alexberossusgpt.corpus.v1",
        exportedAt: new Date().toISOString(),
        documents: this.documents.map((doc) => ({
          id: doc.id,
          title: doc.title,
          text: doc.text,
          source: doc.source,
          metadata: doc.metadata,
          addedAt: doc.addedAt
        }))
      };
    }

    import(value) {
      if (!value || !Array.isArray(value.documents)) {
        throw new Error("Invalid corpus JSON.");
      }

      this.documents = value.documents.map((doc) => ({
        id: String(doc.id || uid()),
        title: String(doc.title || "Untitled source"),
        text: normalize(doc.text),
        source: doc.source || "import",
        metadata: doc.metadata || {},
        addedAt: doc.addedAt || new Date().toISOString()
      })).filter((doc) => doc.text);

      this.rebuild();
    }

    static async readFile(file) {
      const name = file.name.toLowerCase();
      const raw = await file.text();

      if (name.endsWith(".json")) {
        try {
          const parsed = JSON.parse(raw);
          const pretty = typeof parsed === "string"
            ? parsed
            : JSON.stringify(parsed, null, 2);
          return { title: file.name, text: pretty, source: "file-json" };
        } catch {
          return { title: file.name, text: raw, source: "file-text" };
        }
      }

      return { title: file.name, text: raw, source: "file-text" };
    }
  }

  window.AlexBerossusCorpus = AlexBerossusCorpus;
  window.AlexBerossusText = Object.freeze({
    normalize,
    tokenize,
    chunkText
  });
})();

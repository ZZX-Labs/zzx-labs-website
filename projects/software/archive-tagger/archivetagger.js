(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const state = {
    store: new ArchiveTaggerStore(),
    taxonomy: new ArchiveTaggerTaxonomy(),
    search: new ArchiveTaggerSearch(),
    ocr: new ArchiveTaggerOCR(),
    core: null,
    selectedId: null,
    objectUrl: null,
    queue: { total: 0, processed: 0, errors: 0, bytes: 0 }
  };

  state.core = new ArchiveTaggerCore({
    store: state.store,
    taxonomy: state.taxonomy,
    search: state.search,
    ocr: state.ocr
  });

  function fmtBytes(n) {
    return ArchiveTaggerMetadata.formatBytes(n);
  }

  function shortHash(h, n=10) {
    if (!h) return "—";
    return h.length > n*2 ? `${h.slice(0,n)}…${h.slice(-n)}` : h;
  }

  function downloadBlob(text, filename, type="application/octet-stream") {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function log(message) {
    const out = $("scan-log");
    const stamp = new Date().toLocaleTimeString();
    out.textContent += `\n[${stamp}] ${message}`;
    out.scrollTop = out.scrollHeight;
  }

  function updateQueue() {
    $("scan-queue").textContent = String(state.queue.total);
    $("scan-processed").textContent = String(state.queue.processed);
    $("scan-errors").textContent = String(state.queue.errors);
    $("scan-bytes").textContent = fmtBytes(state.queue.bytes);
    const done = state.queue.processed + state.queue.errors;
    const pct = state.queue.total ? (done / state.queue.total) * 100 : 0;
    $("scan-progress").style.width = `${pct}%`;
  }

  function duplicateAnalysis() {
    return state.core.duplicateAnalysis();
  }

  function renderCatalog() {
    const body = $("catalog-body");
    body.replaceChildren();

    if (!state.core.records.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = '<td colspan="5" class="muted">No records.</td>';
      body.appendChild(tr);
    } else {
      for (const record of [...state.core.records].sort((a,b) => a.name.localeCompare(b.name))) {
        const tr = document.createElement("tr");
        if (record.id === state.selectedId) tr.classList.add("active");

        const cells = [
          record.name,
          record.category,
          fmtBytes(record.size),
          (record.tags || []).join(", "),
          shortHash(record.sha256,8)
        ];

        cells.forEach((value, i) => {
          const td = document.createElement("td");
          if (i === 0 || i === 4) {
            const code = document.createElement("code");
            code.textContent = value;
            td.appendChild(code);
          } else {
            td.textContent = value;
          }
          tr.appendChild(td);
        });

        tr.addEventListener("click", () => {
          state.selectedId = record.id;
          renderCatalog();
          renderPreview();
          document.querySelector('.mode-tab[data-mode="preview"]')?.click();
        });

        body.appendChild(tr);
      }
    }

    const dups = duplicateAnalysis().exact;
    const tags = new Set(state.core.records.flatMap(r => r.tags || []));
    const totalBytes = state.core.records.reduce((s,r) => s + (Number(r.size)||0), 0);
    const textCount = state.core.records.filter(r => r.text).length;

    $("catalog-count").textContent = String(state.core.records.length);
    $("catalog-bytes").textContent = fmtBytes(totalBytes);
    $("catalog-text").textContent = String(textCount);
    $("catalog-tags").textContent = String(tags.size);
    $("catalog-dups").textContent = String(dups.length);
  }

  function renderRules() {
    const root = $("rule-list");
    root.replaceChildren();

    if (!state.taxonomy.rules.length) {
      const item = document.createElement("div");
      item.className = "at-rule";
      item.innerHTML = "<p>No taxonomy rules.</p>";
      root.appendChild(item);
      return;
    }

    for (const rule of state.taxonomy.rules) {
      const el = document.createElement("div");
      el.className = "at-rule";

      const head = document.createElement("div");
      head.className = "at-rule-head";

      const strong = document.createElement("strong");
      strong.textContent = rule.tag;

      const count = document.createElement("span");
      count.className = "muted";
      count.textContent = `${rule.keywords.length} keyword(s)`;

      head.append(strong, count);

      const p = document.createElement("p");
      p.textContent = rule.keywords.join(", ");

      const actions = document.createElement("div");
      actions.className = "at-inline-actions";

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "REMOVE";
      remove.addEventListener("click", () => {
        state.taxonomy.remove(rule.tag);
        renderRules();
      });

      actions.appendChild(remove);
      el.append(head,p,actions);
      root.appendChild(el);
    }
  }

  function renderDuplicates() {
    const { exact, near } = duplicateAnalysis();

    const exactRoot = $("duplicate-exact");
    exactRoot.replaceChildren();
    if (!exact.length) {
      exactRoot.innerHTML = '<div class="at-duplicate"><p>No exact duplicate groups.</p></div>';
    } else {
      for (const group of exact) {
        const el = document.createElement("div");
        el.className = "at-duplicate";
        const head = document.createElement("div");
        head.className = "at-duplicate-head";
        const strong = document.createElement("strong");
        strong.textContent = `${group.items.length} exact copies`;
        const span = document.createElement("span");
        span.className = "muted";
        span.textContent = shortHash(group.sha256,10);
        head.append(strong,span);

        const p = document.createElement("p");
        p.textContent = group.items.map(x => x.name).join(" · ");
        el.append(head,p);
        exactRoot.appendChild(el);
      }
    }

    const nearRoot = $("duplicate-near");
    nearRoot.replaceChildren();
    if (!near.length) {
      nearRoot.innerHTML = '<div class="at-duplicate"><p>No near-image pairs at Hamming distance ≤ 6.</p></div>';
    } else {
      for (const pair of near.slice(0,200)) {
        const el = document.createElement("div");
        el.className = "at-duplicate";
        const head = document.createElement("div");
        head.className = "at-duplicate-head";
        const strong = document.createElement("strong");
        strong.textContent = `${pair.a.name} ↔ ${pair.b.name}`;
        const span = document.createElement("span");
        span.className = "muted";
        span.textContent = `distance ${pair.distance}`;
        head.append(strong,span);

        const p = document.createElement("p");
        p.textContent = `${pair.a.perceptualHash} · ${pair.b.perceptualHash}`;
        el.append(head,p);
        nearRoot.appendChild(el);
      }
    }
  }

  function renderSearch(results = []) {
    const root = $("search-results");
    root.replaceChildren();

    if (!results.length) {
      root.innerHTML = '<div class="at-search-item"><p>No search results.</p></div>';
      return;
    }

    results.slice(0,300).forEach(result => {
      const r = result.record;
      const el = document.createElement("div");
      el.className = "at-search-item";

      const head = document.createElement("div");
      head.className = "at-search-head";
      const strong = document.createElement("strong");
      strong.textContent = r.name;
      const score = document.createElement("span");
      score.className = "muted";
      score.textContent = `score ${result.score.toFixed(2)}`;
      head.append(strong,score);

      const chips = document.createElement("div");
      chips.className = "at-chip-row";
      for (const tag of r.tags || []) {
        const chip = document.createElement("span");
        chip.className = "at-chip tag";
        chip.textContent = tag;
        chips.appendChild(chip);
      }

      const p = document.createElement("p");
      p.textContent = result.snippet || `${r.category} · ${fmtBytes(r.size)} · ${r.type}`;

      el.append(head,chips,p);
      el.addEventListener("click", () => {
        state.selectedId = r.id;
        renderCatalog();
        renderPreview();
        document.querySelector('.mode-tab[data-mode="preview"]')?.click();
      });
      root.appendChild(el);
    });
  }

  function revokePreview() {
    if (state.objectUrl) {
      URL.revokeObjectURL(state.objectUrl);
      state.objectUrl = null;
    }
  }

  function addMeta(dt, dd, key, value) {
    const t = document.createElement("dt");
    t.textContent = key;
    const d = document.createElement("dd");
    d.textContent = value == null || value === "" ? "—" : String(value);
    dt.appendChild(t); dd.appendChild(d);
  }

  function renderPreview() {
    revokePreview();

    const record = state.core.get(state.selectedId);
    const stage = $("preview-stage");
    const meta = $("preview-meta");
    stage.replaceChildren();
    meta.replaceChildren();

    if (!record) {
      stage.innerHTML = '<span class="muted">Select a catalog record.</span>';
      $("preview-tags").value = "";
      $("preview-text").value = "";
      return;
    }

    const file = state.core.fileFor(record.id);

    if (file) {
      state.objectUrl = URL.createObjectURL(file);

      if (record.category === "image") {
        const img = document.createElement("img");
        img.src = state.objectUrl;
        img.alt = record.name;
        stage.appendChild(img);
      } else if (record.category === "audio") {
        const audio = document.createElement("audio");
        audio.controls = true;
        audio.src = state.objectUrl;
        stage.appendChild(audio);
      } else if (record.category === "video") {
        const video = document.createElement("video");
        video.controls = true;
        video.src = state.objectUrl;
        stage.appendChild(video);
      } else if (record.category === "text") {
        const pre = document.createElement("pre");
        pre.textContent = record.text || "(empty text)";
        stage.appendChild(pre);
      } else {
        const box = document.createElement("div");
        box.className = "muted";
        box.textContent = "No inline preview for this binary/archive format.";
        stage.appendChild(box);
      }
    } else {
      const box = document.createElement("div");
      box.className = "muted";
      box.textContent = "Original file is not present in this browser session. Persisted metadata is still available.";
      stage.appendChild(box);
    }

    const pairs = [
      ["Name", record.name],
      ["Category", record.category],
      ["MIME", record.type],
      ["Extension", record.extension],
      ["Size", fmtBytes(record.size)],
      ["SHA-256", record.sha256],
      ["Perceptual hash", record.perceptualHash],
      ["Modified", record.lastModifiedIso],
      ["Indexed", record.indexedAt],
      ["Source", record.source],
      ["Source URL", record.sourceUrl],
      ["Dimensions", record.metadata?.width && record.metadata?.height ? `${record.metadata.width} × ${record.metadata.height}` : null],
      ["Duration", record.metadata?.duration != null ? `${record.metadata.duration.toFixed(3)} s` : null],
      ["Text lines", record.metadata?.lines],
      ["Text words", record.metadata?.words],
      ["Archive entries", record.metadata?.archiveEntryCount],
      ["OCR provider", record.metadata?.ocrProvider]
    ];

    for (const [key,value] of pairs) {
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = key;
      dd.textContent = value == null || value === "" ? "—" : String(value);
      meta.append(dt,dd);
    }

    $("preview-tags").value = (record.tags || []).join(", ");
    $("preview-text").value = record.text || "";
  }

  async function processFiles(files) {
    const list = [...files];
    if (!list.length) return;

    state.queue = {
      total: list.length,
      processed: 0,
      errors: 0,
      bytes: list.reduce((s,f) => s + f.size, 0)
    };
    updateQueue();
    log(`Queued ${list.length} file(s), ${fmtBytes(state.queue.bytes)}.`);

    await state.core.processFiles(list, {
      onStart(file, i, total) {
        log(`Processing ${i+1}/${total}: ${file.name}`);
      },
      onRecord(record) {
        state.queue.processed++;
        log(`Indexed ${record.name} · ${record.category} · ${shortHash(record.sha256,8)}`);
      },
      onError(file, error) {
        state.queue.errors++;
        log(`ERROR ${file.name}: ${error.message}`);
      },
      onProgress() {
        updateQueue();
        renderCatalog();
      }
    });

    renderCatalog();
    renderDuplicates();
    renderSearch([]);
    updateQueue();
  }

  async function fetchUrl() {
    const url = $("scan-url").value.trim();
    if (!/^https?:\/\//i.test(url)) throw new Error("Enter an HTTP(S) URL.");

    log(`Fetching ${url}`);
    const response = await fetch(url, { mode: "cors", cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const blob = await response.blob();
    const name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "download.bin");
    const file = new File([blob], name, {
      type: blob.type || response.headers.get("content-type") || "application/octet-stream",
      lastModified: Date.now()
    });

    state.queue = { total: 1, processed: 0, errors: 0, bytes: file.size };
    updateQueue();

    try {
      const record = await state.core.processFile(file, { source: "url", sourceUrl: url });
      state.queue.processed = 1;
      log(`Indexed URL ${record.name}`);
      renderCatalog();
      renderDuplicates();
    } catch (error) {
      state.queue.errors = 1;
      log(`URL ERROR: ${error.message}`);
      throw error;
    } finally {
      updateQueue();
    }
  }

  function csvEscape(value) {
    const s = String(value ?? "");
    return `"${s.replace(/"/g,'""')}"`;
  }

  function exportCsv() {
    const headers = [
      "id","name","category","type","extension","size","sha256","perceptualHash",
      "tags","lastModifiedIso","indexedAt","source","sourceUrl","text"
    ];

    const lines = [headers.join(",")];
    for (const r of state.core.records) {
      lines.push(headers.map(h => {
        const value = h === "tags" ? (r.tags || []).join("|") : r[h];
        return csvEscape(value);
      }).join(","));
    }

    downloadBlob(lines.join("\n"), `archivetagger-${Date.now()}.csv`, "text/csv");
  }

  function exportJsonl() {
    const lines = state.core.records.map(r => JSON.stringify({
      id: r.id,
      name: r.name,
      sha256: r.sha256,
      category: r.category,
      mime: r.type,
      tags: r.tags,
      text: r.text,
      metadata: r.metadata
    }));
    downloadBlob(lines.join("\n"), `archivetagger-dataset-${Date.now()}.jsonl`, "application/x-ndjson");
  }

  async function importCatalog(file) {
    const value = JSON.parse(await file.text());
    const count = await state.core.importCatalog(value);
    state.selectedId = null;
    renderAll();
    $("export-output").textContent = `Imported ${count} record(s). Raw file handles are not part of catalog JSON.`;
  }

  function renderAll() {
    renderCatalog();
    renderRules();
    renderDuplicates();
    renderPreview();
    updateQueue();
  }

  function bind(id, event, handler) {
    const el = $(id);
    if (!el) return;
    el.addEventListener(event, async evt => {
      try {
        await handler(evt);
      } catch (error) {
        console.error(error);
        if (id.includes("export") || id.includes("import") || id.includes("catalog-clear")) {
          $("export-output").textContent = `ERROR: ${error.message}`;
        } else {
          log(`ERROR: ${error.message}`);
        }
      }
    });
  }

  function setupDropzone() {
    const dz = $("scan-dropzone");

    ["dragenter","dragover"].forEach(name => {
      dz.addEventListener(name, e => {
        e.preventDefault();
        dz.classList.add("dragover");
      });
    });

    ["dragleave","drop"].forEach(name => {
      dz.addEventListener(name, e => {
        e.preventDefault();
        dz.classList.remove("dragover");
      });
    });

    dz.addEventListener("drop", e => processFiles(e.dataTransfer?.files || []));
  }

  function bindEvents() {
    bind("scan-files","change", async () => {
      const files = [...($("scan-files").files || [])];
      $("scan-files").value = "";
      await processFiles(files);
    });
    bind("scan-fetch-url","click",fetchUrl);
    bind("scan-cancel","click",() => {
      state.core.cancel();
      log("Queue cancellation requested.");
    });
    bind("scan-clear-session","click",() => {
      state.core.clearSessionFiles();
      revokePreview();
      renderPreview();
      log("Session file handles cleared; persisted metadata retained.");
    });

    bind("rule-add","click",() => {
      state.taxonomy.add($("rule-tag").value,$("rule-keywords").value);
      $("rule-tag").value = "";
      $("rule-keywords").value = "";
      renderRules();
    });
    bind("rule-apply-all","click",async () => {
      await state.core.applyTaxonomyAll();
      renderAll();
    });
    bind("rule-reset-defaults","click",() => {
      state.taxonomy.resetDefaults();
      renderRules();
    });
    bind("rule-clear","click",() => {
      state.taxonomy.clear();
      renderRules();
    });

    bind("search-run","click",() => {
      const results = state.core.search($("search-query").value,{
        tagsOnly:$("search-tag-only").checked
      });
      renderSearch(results);
    });
    bind("search-query","keydown",e => {
      if (e.key === "Enter") {
        e.preventDefault();
        renderSearch(state.core.search($("search-query").value,{
          tagsOnly:$("search-tag-only").checked
        }));
      }
    });

    bind("duplicates-refresh","click",renderDuplicates);

    bind("preview-save-tags","click",async () => {
      const record = state.core.get(state.selectedId);
      if (!record) throw new Error("Select a record.");
      record.tags = [...new Set(
        $("preview-tags").value.split(",").map(x => x.trim().toLowerCase()).filter(Boolean)
      )].sort();
      await state.core.update(record);
      renderAll();
    });

    bind("preview-save-text","click",async () => {
      const record = state.core.get(state.selectedId);
      if (!record) throw new Error("Select a record.");
      record.text = $("preview-text").value;
      record.metadata.manualTextEditedAt = new Date().toISOString();
      record.tags = state.taxonomy.apply(record);
      await state.core.update(record);
      renderAll();
    });

    bind("preview-copy-text","click",async () => {
      const record = state.core.get(state.selectedId);
      if (!record) throw new Error("Select a record.");
      await navigator.clipboard.writeText(record.text || "");
    });

    bind("preview-ocr","click",async () => {
      if (!state.selectedId) throw new Error("Select an image record.");
      $("preview-text").value = "OCR running…";
      const text = await state.core.runOCR(state.selectedId);
      $("preview-text").value = text;
      renderAll();
    });

    bind("export-json","click",() => {
      downloadBlob(
        JSON.stringify(state.core.exportCatalog(),null,2),
        `archivetagger-catalog-${Date.now()}.json`,
        "application/json"
      );
    });
    bind("export-csv","click",exportCsv);
    bind("export-jsonl","click",exportJsonl);

    bind("import-catalog","change",async () => {
      const file = $("import-catalog").files?.[0];
      if (file) await importCatalog(file);
      $("import-catalog").value = "";
    });

    bind("catalog-clear","click",async () => {
      await state.core.clear();
      state.selectedId = null;
      renderAll();
      $("export-output").textContent = "Catalog cleared.";
    });

    setupDropzone();
  }

  function exposeApi() {
    window.ArchiveTagger = Object.freeze({
      version: "0.1.0-alpha-web",

      async addFile(file) {
        const record = await state.core.processFile(file);
        renderAll();
        return state.core.publicRecord(record);
      },

      async addFiles(files) {
        await processFiles(files);
        return state.core.records.map(r => state.core.publicRecord(r));
      },

      search(query, options = {}) {
        return state.core.search(query, options).map(x => ({
          ...x,
          record: state.core.publicRecord(x.record)
        }));
      },

      duplicateAnalysis() {
        const x = state.core.duplicateAnalysis();
        return {
          exact: x.exact.map(g => ({
            sha256:g.sha256,
            items:g.items.map(r => state.core.publicRecord(r))
          })),
          near: x.near.map(p => ({
            a:state.core.publicRecord(p.a),
            b:state.core.publicRecord(p.b),
            distance:p.distance
          }))
        };
      },

      registerOCRProvider(provider, name="custom") {
        state.ocr.register(provider,name);
        $("status-ocr").textContent = provider ? `OCR: ${name.toUpperCase()}` : "OCR: PROVIDER";
        $("status-ocr").className = `runtime-badge ${provider ? "ok" : "partial"}`;
      },

      getRecord(id) {
        const r = state.core.get(id);
        return r ? state.core.publicRecord(r) : null;
      },

      getRecords() {
        return state.core.records.map(r => state.core.publicRecord(r));
      },

      exportCatalog() {
        return state.core.exportCatalog();
      },

      async importCatalog(value) {
        const count = await state.core.importCatalog(value);
        renderAll();
        return count;
      },

      getState() {
        return {
          records: state.core.records.length,
          sessionFiles: state.core.fileHandles.size,
          taxonomyRules: state.taxonomy.rules.length,
          ocrProvider: state.ocr.name
        };
      }
    });
  }

  (async () => {
    if (state.ocr.provider) {
      $("status-ocr").textContent = `OCR: ${state.ocr.name.toUpperCase()}`;
      $("status-ocr").className = "runtime-badge ok";
    }

    await state.core.restore();
    bindEvents();
    renderAll();
    exposeApi();

    window.ZZXHooks?.emit("archivetagger:ready",{
      version:"0.1.0-alpha-web",
      restored:state.core.records.length
    });
  })().catch(error => {
    console.error(error);
    log(`Startup error: ${error.message}`);
  });
})();

// YTRP/YTRPV — command builder + optional local run.
// Local API (optional):
//  - POST /api/ytrp  { cmd, url }   -> runs audio flow
//  - POST /api/ytrpv { cmd, url }   -> runs video flow

(function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  // DOM refs
  const titleEl   = $("#project-title");
  const blurbEl   = $("#project-blurb");
  const logoEl    = $("#project-logo");
  const ctaRow    = $("#cta-row");
  const badgesEl  = $("#project-badges");
  const galleryEl = $("#gallery");
  const galHintEl = $("#gallery-hint");

  const form      = $("#ytrp-form");
  const srcEl     = $("#src");
  const qualityEl = $("#quality");
  const formatEl  = $("#format");
  const subsEl    = $("#subs");
  const embedSubsEl = $("#embedSubs");
  const embedMetaEl = $("#embedMeta");
  const thumbEl     = $("#thumbnail");
  const startEl   = $("#start");
  const endEl     = $("#end");
  const tmplEl    = $("#template");
  const extraEl   = $("#extra");
  const playAllEl = $("#playAll");
  const plFromEl  = $("#plFrom");
  const plToEl    = $("#plTo");

  const buildBtn  = $("#build");
  const copyBtn   = $("#copy");
  const runBtn    = $("#run");
  const cmdEl     = $("#cmd");
  const queueEl   = $("#queue");
  const histEl    = $("#history");

  let manifest = null;

  /* ---------- manifest boot ---------- */
  async function bootManifest() {
    const res = await fetch("./manifest.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    manifest = await res.json();

    if (manifest.title) titleEl.textContent = manifest.title;
    if (manifest.blurb) blurbEl.textContent = manifest.blurb;
    const logo = manifest.logo || (manifest.images && manifest.images[0]);
    if (logo) logoEl.src = logo;

    addBtn("Open", manifest.href || "/projects/software/ytrp/");
    if (manifest.github_url) addBtn("GitHub", manifest.github_url, "ghost");
    if (manifest.docs_url) addBtn("Docs", manifest.docs_url, "ghost");

    addBadge(cap(manifest.state || "pre-release"));
    if (Array.isArray(manifest.versions) && manifest.versions.length) {
      const latest = manifest.versions[0];
      if (latest?.version) addBadge(`v${latest.version}`, false);
    }

    const imgs = Array.isArray(manifest.images) ? manifest.images : [];
    if (!imgs.length) {
      galHintEl.textContent = "No screenshots yet.";
    } else {
      imgs.forEach((src) => addImg(src, manifest.title || "YTRP"));
      galHintEl.textContent = "";
    }

    // Prefill template from manifest if provided
    if (manifest.default_template) tmplEl.value = manifest.default_template;
  }

  function addBtn(text, href, style = "solid") {
    if (!href) return;
    const a = document.createElement("a");
    a.className = "btn" + (style === "ghost" ? " ghost" : (style === "alt" ? " alt" : ""));
    a.textContent = text;
    a.href = href;
    if (/^https?:\/\//i.test(href)) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
    ctaRow.appendChild(a);
  }
  function addBadge(label, dot = true) {
    const b = document.createElement("span");
    b.className = "badge";
    b.innerHTML = (dot ? '<span class="dot"></span>' : '') + label;
    badgesEl.appendChild(b);
  }
  function addImg(src, alt) {
    const wrap = document.createElement("figure");
    wrap.className = "image";
    const img = document.createElement("img");
    img.loading = "lazy"; img.decoding = "async";
    img.src = src; img.alt = alt || "YTRP screenshot";
    wrap.appendChild(img); galleryEl.appendChild(wrap);
  }
  function cap(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }

  /* ---------- command builder ---------- */
  function buildCommand() {
    const url = (srcEl.value || "").trim();
    if (!url) return "";

    const mode = ($$('input[name="mode"]:checked')[0]?.value) || "audio";
    const q = qualityEl.value;
    const fmt = formatEl.value;
    const wantSubs = subsEl.checked;
    const embedSubs = embedSubsEl.checked;
    const embedMeta = embedMetaEl.checked;
    const thumb = thumbEl.checked;
    const tStart = (startEl.value || "").trim();
    const tEnd = (endEl.value || "").trim();
    const templ = (tmplEl.value || "%(title)s [%(id)s].%(ext)s").trim();
    const extra = (extraEl.value || "").trim();
    const playAll = playAllEl.checked;
    const plFrom = parseInt(plFromEl.value || "", 10);
    const plTo   = parseInt(plToEl.value || "", 10);

    const parts = ["yt-dlp"];

    // Mode
    if (mode === "audio") {
      // YTRP (Audio-first)
      parts.push("-x"); // extract audio
      // codec/container
      if (fmt === "mp3" || fmt === "m4a" || fmt === "opus" || fmt === "flac") {
        parts.push("--audio-format", fmt);
      } else {
        // audio mode but user picked a video container — force m4a as sane default
        parts.push("--audio-format", "m4a");
      }
      // quality
      if (q === "best") parts.push("--audio-quality", "0");
      if (q === "good") parts.push("--audio-quality", "2");
      if (q === "ok")   parts.push("--audio-quality", "5");
      // extras
      parts.push("--embed-metadata");
      if (thumb) parts.push("--embed-thumbnail");
      if (!embedMeta) {
        // allow disabling metadata embed if user unticks it
        const idx = parts.indexOf("--embed-metadata");
        if (idx >= 0) parts.splice(idx, 1);
      }
    } else {
      // YTRPV (Video-first)
      // prefer bestvideo+bestaudio, let yt-dlp pick container or match desired fmt later
      parts.push("-S", "res,codec:avc:m4a,vcodec:avc"); // gentle sort pref
      if (fmt === "mp4" || fmt === "mkv" || fmt === "webm") {
        parts.push("-o", templ.replace("%(ext)s", fmt)); // if they force ext, bake into template
      }
      if (wantSubs) {
        parts.push("--write-subs", "--write-auto-subs");
        if (embedSubs) parts.push("--embed-subs");
      }
      if (embedMeta) parts.push("--embed-metadata");
      if (thumb) parts.push("--embed-thumbnail");
    }

    // timestamps
    if (tStart) parts.push("--download-sections", `*${tStart}-${tEnd || ""}`);
    // playlist
    if (playAll) parts.push("--yes-playlist");
    else parts.push("--no-playlist");
    if (!isNaN(plFrom)) parts.push("--playlist-start", String(plFrom));
    if (!isNaN(plTo))   parts.push("--playlist-end", String(plTo));

    // template
    if (!(mode === "video" && (fmt === "mp4" || fmt === "mkv" || fmt === "webm") && templ.includes("%(ext)s") === false)) {
      // normal case: allow yt-dlp to determine ext via %(ext)s
      parts.push("-o", templ);
    } else {
      // already forced ext above for video; nothing.
    }

    // extra flags
    if (extra) {
      // very light split — users can enter multiple flags
      const toks = extra.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
      parts.push(...toks);
    }

    // the URL last
    parts.push(url);

    return parts.map(escapeArg).join(" ");
  }

  function escapeArg(a) {
    // If it contains spaces or special chars, quote it
    if (/[\s'"$`\\]/.test(a)) {
      // simple double-quoting + escape internal quotes
      return `"${a.replace(/(["\\$`])/g, '\\$1')}"`;
    }
    return a;
  }

  /* ---------- queue + history ---------- */
  function addJobToQueue(cmd, url, mode) {
    const el = document.createElement("div");
    el.className = "job";
    el.innerHTML = `
      <div class="row">
        <div><strong>${mode === "audio" ? "YTRP" : "YTRPV"}</strong> — <span class="muted">${url}</span></div>
        <div class="muted" data-status="status">queued</div>
      </div>
      <pre class="cmd"><code>${cmd}</code></pre>
    `;
    queueEl.prepend(el);
    return el;
  }

  function pushHistory(cmd) {
    try {
      const key = "ytrp.history";
      const arr = JSON.parse(localStorage.getItem(key) || "[]");
      arr.unshift({ t: Date.now(), cmd });
      while (arr.length > 25) arr.pop();
      localStorage.setItem(key, JSON.stringify(arr));
      renderHistory();
    } catch {}
  }

  function renderHistory() {
    histEl.innerHTML = "";
    try {
      const key = "ytrp.history";
      const arr = JSON.parse(localStorage.getItem(key) || "[]");
      arr.forEach(item => {
        const d = new Date(item.t);
        const el = document.createElement("div");
        el.className = "job";
        el.innerHTML = `
          <div class="row"><div class="muted">${d.toLocaleString()}</div></div>
          <pre class="cmd"><code>${item.cmd}</code></pre>
        `;
        histEl.appendChild(el);
      });
    } catch {}
  }

  /* ---------- local run (optional) ---------- */
  async function tryLocalRun(cmd, url, mode, statusEl) {
    const endpoint = mode === "audio" ? "/api/ytrp" : "/api/ytrpv";
    statusEl.textContent = "running…";
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cmd, url })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const out = await res.json().catch(() => ({}));
      statusEl.textContent = out?.status || "done";
    } catch (e) {
      statusEl.textContent = "api not found — use CLI";
    }
  }

  /* ---------- events ---------- */
  buildBtn.addEventListener("click", () => {
    const cmd = buildCommand();
    cmdEl.value = cmd;
    if (cmd) pushHistory(cmd);
  });

  copyBtn.addEventListener("click", async () => {
    const text = cmdEl.value.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      copyBtn.textContent = "Copied!";
      setTimeout(() => (copyBtn.textContent = "Copy"), 900);
    } catch {
      // fallback
      cmdEl.select();
      document.execCommand("copy");
    }
  });

  runBtn.addEventListener("click", async () => {
    const cmd = (cmdEl.value || "").trim() || buildCommand();
    cmdEl.value = cmd;
    if (!cmd) return;

    const url = (srcEl.value || "").trim();
    const mode = ($$('input[name="mode"]:checked')[0]?.value) || "audio";
    const job = addJobToQueue(cmd, url, mode);
    const statusEl = job.querySelector('[data-status="status"]');
    tryLocalRun(cmd, url, mode, statusEl);
  });

  // manifest + history
  (async () => {
    try { await bootManifest(); } catch (e) { console.error(e); }
    renderHistory();
  })();
})();

// BitFig — unified project page boot + Bitcoin Core/Knots config generator
// Reads ./manifest.json for page chrome, then provides an in-browser form
// that emits a bitcoin.conf (with optional custom paths) and a JSON preset.

(function () {
  const $  = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const escAttr = (s) => String(s).replace(/"/g, '&quot;');

  /* ---------- Page chrome ---------- */
  const titleEl   = $("#project-title");
  const blurbEl   = $("#project-blurb");
  const logoEl    = $("#project-logo");
  const ctaRow    = $("#cta-row");
  const badgesEl  = $("#project-badges");
  const galleryEl = $("#gallery");
  const galHintEl = $("#gallery-hint");

  const BUTTONS = [
    ["Open","href","solid"],
    ["GitHub","github_url","ghost"],
    ["Docs","docs_url","ghost"],
    ["Website","website_url","ghost"],
    ["Hugging Face","huggingface_url","ghost"],
    ["README","readme_url","ghost"],
    ["LICENSE","license_url","ghost"],
    ["Demo","demo_url","alt"],
    ["Download","download_url","alt"]
  ];

  (async function boot() {
    try {
      const res = await fetch("./manifest.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const m = await res.json();

      if (m.title) titleEl.textContent = m.title;
      if (m.blurb) blurbEl.textContent = m.blurb;
      const logo = m.logo || (Array.isArray(m.images) && m.images[0]);
      if (logo) logoEl.src = logo;

      BUTTONS.forEach(([label, key, style]) => addBtn(label, m[key], style));
      addBadge(cap(m.state || "alpha"));
      const latest = normalizeVersions(m.versions || [])[0];
      if (latest?.version) addBadge(`v${latest.version}`, false);

      const media = mergeMedia(m.images, m.media);
      if (!media.length) galHintEl.textContent = "No screenshots yet.";
      else {
        galHintEl.textContent = "";
        media.forEach(addMedia);
      }

      wireBitFigForm();
    } catch (e) {
      console.error(e);
      galHintEl.textContent = "Manifest failed to load.";
    }
  })();

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
    b.innerHTML = (dot ? '<span class="dot"></span>' : '') + esc(label);
    badgesEl.appendChild(b);
  }
  function addMedia(item) {
    const wrap = document.createElement("figure");
    wrap.className = "image";
    if (item.type === "video") {
      const v = document.createElement("video");
      v.src = item.src; v.controls = true; v.preload = "metadata";
      if (item.poster) v.poster = item.poster;
      wrap.appendChild(v);
    } else if (item.type === "embed") {
      const iframe = document.createElement("iframe");
      iframe.src = item.src; iframe.loading = "lazy";
      iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      iframe.allowFullscreen = true; iframe.style.width = "100%"; iframe.style.minHeight = "260px";
      wrap.appendChild(iframe);
    } else {
      const img = document.createElement("img");
      img.src = item.src; img.alt = item.alt || "Project media"; img.loading = "lazy"; img.decoding = "async";
      wrap.appendChild(img);
    }
    galleryEl.appendChild(wrap);
  }
  function mergeMedia(images, media) {
    const imgs = Array.isArray(images) ? images.map(src => ({ type: "image", src })) : [];
    const med  = Array.isArray(media) ? media : [];
    return imgs.concat(med);
  }
  function cap(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }
  function normalizeVersions(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map(v => (typeof v === "string" ? {version: v} : v)).filter(Boolean);
  }

  /* ---------- BitFig: form → bitcoin.conf generator ---------- */
  function wireBitFigForm() {
    const outConf   = $("#output-config");      // <textarea>
    const outPreset = $("#output-preset");      // <textarea> (optional)
    const hintEl    = $("#gen-hint");           // <span>

    // Core fields (IDs are optional; the generator tolerates missing inputs):
    const F = {
      network:      $("#f-network"),        // mainnet/testnet/signet/regtest
      txindex:      $("#f-txindex"),        // checkbox
      prune:        $("#f-prune"),          // number (MiB)
      maxmempool:   $("#f-maxmempool"),     // number (MiB)
      zmqpubrawtx:  $("#f-zmqpubrawtx"),    // tcp://127.0.0.1:28332
      zmqpubrawblock: $("#f-zmqpubrawblock"),
      rpcuser:      $("#f-rpcuser"),
      rpcpassword:  $("#f-rpcpassword"),
      rpcport:      $("#f-rpcport"),
      port:         $("#f-port"),
      onlynet:      $("#f-onlynet"),        // ipv4/ipv6/tor
      whitelist:    $("#f-whitelist"),      // CSV or lines
      addnode:      $("#f-addnode"),        // lines
      connect:      $("#f-connect"),        // lines
      dbcache:      $("#f-dbcache"),        // number (MiB)

      // NEW: custom paths
      confpath:     $("#f-confpath"),       // shown in header comment
      datadir:      $("#f-datadir"),
      blocksdir:    $("#f-blocksdir"),
      walletdir:    $("#f-walletdir"),

      // Buttons
      genBtn:       $("#btn-generate-conf"),
      copyBtn:      $("#btn-copy-conf"),
      dlBtn:        $("#btn-download-conf")
    };

    // Helpers
    const readValue = (el) => (el && "value" in el) ? el.value.trim() : "";
    const readNum   = (el) => {
      const v = readValue(el); if (!v) return "";
      const n = Number(v); return Number.isFinite(n) ? String(n) : "";
    };
    const readLines = (el) => (readValue(el).split(/\r?\n/).map(s => s.trim()).filter(Boolean));
    const readCSVorLines = (el) => {
      const txt = readValue(el);
      if (!txt) return [];
      const lines = txt.includes("\n") ? txt.split(/\r?\n/) : txt.split(",");
      return lines.map(s => s.trim()).filter(Boolean);
    };

    function makeConf() {
      const net        = readValue(F.network) || "mainnet";
      const txindex    = !!(F.txindex && F.txindex.checked);
      const prune      = readNum(F.prune);
      const maxmempool = readNum(F.maxmempool);
      const zmqtx      = readValue(F.zmqpubrawtx);
      const zmqblk     = readValue(F.zmqpubrawblock);
      const rpcuser    = readValue(F.rpcuser);
      const rpcpass    = readValue(F.rpcpassword);
      const rpcport    = readNum(F.rpcport);
      const port       = readNum(F.port);
      const onlynet    = readValue(F.onlynet);
      const whitelist  = readCSVorLines(F.whitelist);
      const addnodes   = readLines(F.addnode);
      const connects   = readLines(F.connect);
      const dbcache    = readNum(F.dbcache);

      // New: paths
      const confpath   = readValue(F.confpath);
      const datadir    = readValue(F.datadir);
      const blocksdir  = readValue(F.blocksdir);
      const walletdir  = readValue(F.walletdir);

      const lines = [];

      // Header (with config path hint if provided)
      lines.push("# BitFig generated bitcoin.conf");
      if (confpath) lines.push(`# Target: ${confpath}`);
      lines.push(`# Generated: ${new Date().toISOString()}`);
      lines.push("");

      // Network
      if (net && net !== "mainnet") {
        // bitcoin.conf supports [test] sections OR network flags; we use flags for clarity
        if (net === "testnet")  lines.push("testnet=1");
        if (net === "signet")   lines.push("signet=1");
        if (net === "regtest")  lines.push("regtest=1");
      }

      // Paths (customizable)
      if (datadir)   lines.push(`datadir=${datadir}`);
      if (blocksdir) lines.push(`blocksdir=${blocksdir}`);
      if (walletdir) lines.push(`walletdir=${walletdir}`);

      // Node networking
      if (port) lines.push(`port=${port}`);
      if (onlynet) lines.push(`onlynet=${onlynet}`);
      whitelist.forEach(entry => lines.push(`whitelist=${entry}`));
      addnodes.forEach(n => lines.push(`addnode=${n}`));
      connects.forEach(c => lines.push(`connect=${c}`));

      // Resources / caching / prune
      if (dbcache)     lines.push(`dbcache=${dbcache}`);
      if (prune)       lines.push(`prune=${prune}`);
      if (maxmempool)  lines.push(`maxmempool=${maxmempool}`);

      // Indexes
      lines.push(`txindex=${txindex ? 1 : 0}`);

      // RPC / ZMQ
      if (rpcuser) lines.push(`rpcuser=${rpcuser}`);
      if (rpcpass) lines.push(`rpcpassword=${rpcpass}`);
      if (rpcport) lines.push(`rpcport=${rpcport}`);
      if (zmqtx)   lines.push(`zmqpubrawtx=${zmqtx}`);
      if (zmqblk)  lines.push(`zmqpubrawblock=${zmqblk}`);

      lines.push("");
      lines.push("# End of configuration");
      return lines.join("\n");
    }

    function copyToClipboard(text) {
      if (!navigator.clipboard) return Promise.reject(new Error("no clipboard API"));
      return navigator.clipboard.writeText(text);
    }

    F.genBtn?.addEventListener("click", () => {
      const conf = makeConf();
      if (outConf) outConf.value = conf;
      if (outPreset) {
        // Optional: also dump a JSON preset of the chosen params
        const preset = collectPreset();
        outPreset.value = JSON.stringify(preset, null, 2);
      }
      if (hintEl) hintEl.textContent = "Config generated.";
    });

    F.copyBtn?.addEventListener("click", () => {
      const conf = outConf?.value || "";
      if (!conf) return;
      copyToClipboard(conf).then(() => flash(F.copyBtn, "Copied!")).catch(()=>{});
    });

    F.dlBtn?.addEventListener("click", () => {
      const conf = outConf?.value || "";
      if (!conf) return;
      const name = suggestConfName() || "bitcoin.conf";
      downloadText(name, conf);
      flash(F.dlBtn, "Saved!");
    });

    function suggestConfName() {
      const path = readValue(F.confpath);
      if (!path) return "bitcoin.conf";
      const leaf = path.split(/[\\/]/).pop();
      return leaf || "bitcoin.conf";
    }

    function collectPreset() {
      const pick = (el) => readValue(el) || undefined;
      const pickNum = (el) => {
        const v = readNum(el);
        return v === "" ? undefined : Number(v);
      };
      const pickArr = (el) => readLines(el);

      return {
        network:      pick(F.network) || "mainnet",
        txindex:      !!(F.txindex && F.txindex.checked),
        prune:        pickNum(F.prune),
        maxmempool:   pickNum(F.maxmempool),
        zmqpubrawtx:  pick(F.zmqpubrawtx),
        zmqpubrawblock: pick(F.zmqpubrawblock),
        rpcuser:      pick(F.rpcuser),
        rpcpassword:  pick(F.rpcpassword),
        rpcport:      pickNum(F.rpcport),
        port:         pickNum(F.port),
        onlynet:      pick(F.onlynet),
        whitelist:    readCSVorLines(F.whitelist),
        addnode:      pickArr(F.addnode),
        connect:      pickArr(F.connect),
        dbcache:      pickNum(F.dbcache),

        // Paths
        confpath:     pick(F.confpath),
        datadir:      pick(F.datadir),
        blocksdir:    pick(F.blocksdir),
        walletdir:    pick(F.walletdir)
      };
    }
  }

  /* ---------- helpers: small UX bits ---------- */
  function flash(btn, text) {
    if (!btn) return;
    const old = btn.textContent;
    btn.textContent = text;
    setTimeout(() => btn.textContent = old, 900);
  }
  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    requestAnimationFrame(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    });
  }
})();

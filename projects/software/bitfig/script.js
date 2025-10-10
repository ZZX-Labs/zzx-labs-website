// BitFig — page boot + browser-only config generator
(function () {
  const $  = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const escAttr = (s) => String(s).replace(/"/g, '&quot;');

  /* ---------------- Page chrome: load ./manifest.json ---------------- */
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
      const r = await fetch("./manifest.json", { cache:"no-cache" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const m = await r.json();

      if (m.title) titleEl.textContent = m.title;
      if (m.blurb) blurbEl.textContent = m.blurb;
      const logo = m.logo || (Array.isArray(m.images) && m.images[0]);
      if (logo) logoEl.src = logo;

      BUTTONS.forEach(([label,key,style]) => addBtn(label, m[key], style));
      addBadge(cap(m.state || "alpha"));
      const latest = normalizeVersions(m.versions || [])[0];
      if (latest?.version) addBadge(`v${latest.version}`, false);

      const media = mergeMedia(m.images, m.media);
      if (!media.length) galHintEl.textContent = "No screenshots yet.";
      else { galHintEl.textContent = ""; media.forEach(addMedia); }

      injectForm();               // create the BitFig form UI
      wireBitFigActions();        // hook up Generate / Download
    } catch (e) {
      console.error(e);
      galHintEl.textContent = "Manifest failed to load.";
      injectForm();
      wireBitFigActions();
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
      const i = document.createElement("iframe");
      i.src = item.src; i.loading = "lazy";
      i.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      i.allowFullscreen = true; i.style.width = "100%"; i.style.minHeight = "260px";
      wrap.appendChild(i);
    } else {
      const img = document.createElement("img");
      img.src = item.src; img.alt = item.alt || "Project media"; img.loading = "lazy"; img.decoding = "async";
      wrap.appendChild(img);
    }
    galleryEl.appendChild(wrap);
  }
  function mergeMedia(images, media) {
    const imgs = Array.isArray(images) ? images.map(src => ({ type:"image", src })) : [];
    const med  = Array.isArray(media) ? media : [];
    return imgs.concat(med);
  }
  function cap(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }
  function normalizeVersions(arr) { if (!Array.isArray(arr)) return []; return arr.map(v => (typeof v === "string" ? {version:v} : v)).filter(Boolean); }

  /* ---------------- BitFig form & generator ---------------- */
  function injectForm() {
    const host = $("#bitfig-form-area");
    if (!host) return;

    host.innerHTML = `
      <form id="bitfig-form" class="core-form" autocomplete="off">
        <div class="row">
          <label>Preset
            <select id="f-preset">
              <option value="fullnode" selected>Full Node</option>
              <option value="pruned">Pruned Node</option>
              <option value="dev">Developer</option>
              <option value="miner">Miner</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label>Network
            <select id="f-network">
              <option value="mainnet" selected>mainnet</option>
              <option value="testnet">testnet</option>
              <option value="signet">signet</option>
              <option value="regtest">regtest</option>
            </select>
          </label>
          <label>txindex
            <select id="f-txindex">
              <option value="1">on</option>
              <option value="0" selected>off</option>
            </select>
          </label>
          <label>prune (MiB)
            <input id="f-prune" type="number" min="0" placeholder="0 = off" />
          </label>
        </div>

        <div class="row">
          <label>dbcache (MiB)
            <input id="f-dbcache" type="number" min="4" placeholder="450" />
          </label>
          <label>maxmempool (MiB)
            <input id="f-maxmempool" type="number" min="5" placeholder="300" />
          </label>
          <label>onlynet
            <select id="f-onlynet">
              <option value="">(any)</option>
              <option value="ipv4">ipv4</option>
              <option value="ipv6">ipv6</option>
              <option value="onion">onion (Tor)</option>
              <option value="i2p">i2p</option>
            </select>
          </label>
          <label>port
            <input id="f-port" type="number" min="1" max="65535" placeholder="8333" />
          </label>
        </div>

        <div class="row">
          <label>RPC user
            <input id="f-rpcuser" type="text" placeholder="rpcuser" />
          </label>
          <label>RPC password
            <input id="f-rpcpassword" type="text" placeholder="rpcpassword" />
          </label>
          <label>RPC port
            <input id="f-rpcport" type="number" min="1" max="65535" placeholder="8332" />
          </label>
          <label>ZMQ tx (pub)
            <input id="f-zmqpubrawtx" type="text" placeholder="tcp://127.0.0.1:28332" />
          </label>
        </div>

        <div class="row">
          <label>ZMQ block (pub)
            <input id="f-zmqpubrawblock" type="text" placeholder="tcp://127.0.0.1:28333" />
          </label>
          <label>Peers: whitelist (CSV or lines)
            <textarea id="f-whitelist" rows="2" placeholder="127.0.0.1,192.168.1.0/24"></textarea>
          </label>
        </div>

        <div class="row">
          <label>addnode (one per line)
            <textarea id="f-addnode" rows="3" placeholder="node1.example:8333&#10;node2.example:8333"></textarea>
          </label>
          <label>connect (one per line)
            <textarea id="f-connect" rows="3" placeholder="hard-peering only; overrides addnode"></textarea>
          </label>
        </div>
      </form>
    `;
  }

  function wireBitFigActions() {
    const outConf = $("#output-config");
    const btnGen  = $("#btn-generate");
    const btnDL   = $("#btn-download");

    btnGen?.addEventListener("click", () => {
      const conf = generateConfigFromForm();
      if (outConf) outConf.value = conf;
    });

    btnDL?.addEventListener("click", () => {
      const conf = outConf?.value || "";
      if (!conf) return;
      const name = suggestConfName() || "bitcoin.conf";
      downloadText(name, conf);
      flash(btnDL, "Saved!");
    });
  }

  function readValue(id) {
    const el = (typeof id === "string") ? $(id) : id;
    return (el && "value" in el) ? el.value.trim() : "";
  }
  function readNum(id) {
    const v = readValue(id); if (!v) return "";
    const n = Number(v); return Number.isFinite(n) ? String(n) : "";
  }
  function readLines(id) {
    return readValue(id).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  }
  function readCSVorLines(id) {
    const txt = readValue(id);
    if (!txt) return [];
    const lines = txt.includes("\n") ? txt.split(/\r?\n/) : txt.split(",");
    return lines.map(s => s.trim()).filter(Boolean);
  }

  function generateConfigFromForm() {
    // Paths (already present in your HTML below the form):
    const confpath  = readValue("#f-confpath");
    const datadir   = readValue("#f-datadir");
    const blocksdir = readValue("#f-blocksdir");
    const walletdir = readValue("#f-walletdir");

    // Core conf fields:
    const preset    = readValue("#f-preset") || "fullnode";
    const net       = readValue("#f-network") || "mainnet";
    const txindex   = readValue("#f-txindex") || "0";
    const prune     = readNum("#f-prune");
    const dbcache   = readNum("#f-dbcache");
    const maxmempool= readNum("#f-maxmempool");
    const onlynet   = readValue("#f-onlynet");
    const port      = readNum("#f-port");

    const rpcuser   = readValue("#f-rpcuser");
    const rpcpass   = readValue("#f-rpcpassword");
    const rpcport   = readNum("#f-rpcport");
    const zmqtx     = readValue("#f-zmqpubrawtx");
    const zmqblk    = readValue("#f-zmqpubrawblock");

    const whitelist = readCSVorLines("#f-whitelist");
    const addnodes  = readLines("#f-addnode");
    const connects  = readLines("#f-connect");

    const lines = [];
    lines.push("# BitFig generated bitcoin.conf");
    if (confpath) lines.push(`# Target: ${confpath}`);
    lines.push(`# Preset: ${preset}`);
    lines.push(`# Generated: ${new Date().toISOString()}`);
    lines.push("");

    // Network flags
    if (net && net !== "mainnet") {
      if (net === "testnet") lines.push("testnet=1");
      if (net === "signet")  lines.push("signet=1");
      if (net === "regtest") lines.push("regtest=1");
    }

    // Custom paths
    if (datadir)   lines.push(`datadir=${datadir}`);
    if (blocksdir) lines.push(`blocksdir=${blocksdir}`);
    if (walletdir) lines.push(`walletdir=${walletdir}`);

    // Node networking
    if (port)    lines.push(`port=${port}`);
    if (onlynet) lines.push(`onlynet=${onlynet}`);
    whitelist.forEach(w => lines.push(`whitelist=${w}`));
    addnodes.forEach(n => lines.push(`addnode=${n}`));
    connects.forEach(c => lines.push(`connect=${c}`));

    // Resources
    if (dbcache)     lines.push(`dbcache=${dbcache}`);
    if (prune)       lines.push(`prune=${prune}`);
    if (maxmempool)  lines.push(`maxmempool=${maxmempool}`);

    // Indexing
    lines.push(`txindex=${txindex}`);

    // RPC / ZMQ
    if (rpcuser) lines.push(`rpcuser=${rpcuser}`);
    if (rpcpass) lines.push(`rpcpassword=${rpcpass}`);
    if (rpcport) lines.push(`rpcport=${rpcport}`);
    if (zmqtx)   lines.push(`zmqpubrawtx=${zmqtx}`);
    if (zmqblk)  lines.push(`zmqpubrawblock=${zmqblk}`);

    // Preset helpers (light-touch defaults when fields are blank)
    applyPresetHints(preset, lines, { prune, dbcache, maxmempool, txindex });

    lines.push("");
    lines.push("# End of configuration");
    return lines.join("\n");
  }

  function applyPresetHints(preset, lines, picks) {
    // Only add hints if user didn’t already set the field.
    const addIfMissing = (key, val) => {
      if (!lines.some(l => l.startsWith(key + "="))) lines.push(`${key}=${val}`);
    };

    switch (preset) {
      case "fullnode":
        if (!picks.prune) addIfMissing("prune", 0);
        if (!picks.dbcache) addIfMissing("dbcache", 450);
        break;
      case "pruned":
        if (!picks.prune) addIfMissing("prune", 5500); // ~5.5GB
        if (!picks.dbcache) addIfMissing("dbcache", 300);
        if (!picks.txindex) addIfMissing("txindex", 0);
        break;
      case "dev":
        addIfMissing("server", 1);
        addIfMissing("fallbackfee", 0.0002);
        if (!picks.maxmempool) addIfMissing("maxmempool", 300);
        break;
      case "miner":
        addIfMissing("listen", 1);
        addIfMissing("blocksonly", 0);
        if (!picks.dbcache) addIfMissing("dbcache", 1024);
        break;
      default: // custom
        break;
    }
  }

  function suggestConfName() {
    const p = $("#f-confpath")?.value?.trim() || "";
    if (!p) return "bitcoin.conf";
    const leaf = p.split(/[\\/]/).pop();
    return leaf || "bitcoin.conf";
  }

  /* ---------------- Small UX helpers ---------------- */
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

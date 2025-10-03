// ZZX-BBC — Mesh communicator config builders + manifest wiring.
(function () {
  const $  = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const titleEl   = $("#project-title");
  const blurbEl   = $("#project-blurb");
  const logoEl    = $("#project-logo");
  const ctaRow    = $("#cta-row");
  const badgesEl  = $("#project-badges");
  const galleryEl = $("#gallery");
  const galHintEl = $("#gallery-hint");

  let manifest = null;

  /* ---------- manifest boot ---------- */
  (async function boot() {
    try {
      const res = await fetch("./manifest.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      manifest = await res.json();

      if (manifest.title) titleEl.textContent = manifest.title;
      if (manifest.blurb) blurbEl.textContent = manifest.blurb;
      const logo = manifest.logo || (manifest.images && manifest.images[0]);
      if (logo) logoEl.src = logo;

      addBtn("Open", manifest.href || "/projects/software/zzxbbc/");
      if (manifest.github_url) addBtn("GitHub", manifest.github_url, "ghost");
      if (manifest.docs_url)   addBtn("Docs", manifest.docs_url, "ghost");
      if (manifest.huggingface_url) addBtn("Models", manifest.huggingface_url, "ghost");

      addBadge(cap(manifest.state || "research"));
      if (Array.isArray(manifest.versions) && manifest.versions.length) {
        const latest = manifest.versions[0];
        if (latest?.version) addBadge(`v${latest.version}`, false);
      }

      const imgs = Array.isArray(manifest.images) ? manifest.images : [];
      if (!imgs.length) { galHintEl.textContent = "No screenshots yet."; }
      else {
        imgs.forEach((src) => addImg(src, manifest.title || "ZZX-BBC"));
        galHintEl.textContent = "";
      }

      wireProvisioning();
      wireRadio();
      wireGateway();
      wireOTA();
    } catch (e) {
      console.error(e);
      galHintEl.textContent = "Manifest failed to load.";
      wireProvisioning();
      wireRadio();
      wireGateway();
      wireOTA();
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
    b.innerHTML = (dot ? '<span class="dot"></span>' : '') + label;
    badgesEl.appendChild(b);
  }
  function addImg(src, alt) {
    const wrap = document.createElement("figure");
    wrap.className = "image";
    const img = document.createElement("img");
    img.loading = "lazy"; img.decoding = "async";
    img.src = src; img.alt = alt || "ZZX-BBC image";
    wrap.appendChild(img); galleryEl.appendChild(wrap);
  }
  function cap(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }
  function copyText(el, btn) {
    const t = el.value.trim(); if (!t) return;
    navigator.clipboard.writeText(t).catch(()=>{}).finally(()=>{
      const old = btn.textContent; btn.textContent = "Copied!"; setTimeout(()=>btn.textContent = old, 900);
    });
  }

  /* ---------- Builders ---------- */

  // Provisioning
  function wireProvisioning() {
    const name  = $("#prov-name");
    const email = $("#prov-email");
    const seed  = $("#prov-seed");
    const peers = $("#prov-peers");
    const out   = $("#prov-out");
    $("#prov-build")?.addEventListener("click", () => {
      const obj = {
        device: (name.value || "bb-001").trim(),
        owner: (email.value || "").trim() || null,
        seed_on_boot: !!seed.checked,
        bootstrap_peers: splitCSV(peers.value)
      };
      out.value = j(obj);
    });
    $("#prov-copy")?.addEventListener("click", () => copyText(out, $("#prov-copy")));
  }

  // Radio
  function wireRadio() {
    const region = $("#radio-region");
    const sf     = $("#radio-sf");
    const bw     = $("#radio-bw");
    const cr     = $("#radio-cr");
    const tx     = $("#radio-tx");
    const ch     = $("#radio-ch");
    const out    = $("#radio-out");

    $("#radio-build")?.addEventListener("click", () => {
      const obj = {
        region: region.value,
        lora: {
          sf: num(sf.value, 8),
          bw_khz: num(bw.value, 250),
          cr: cr.value,
          tx_dbm: clamp(num(tx.value, 14), 2, 22),
          channels: splitNUM(ch.value)
        }
      };
      out.value = j(obj);
    });

    $("#radio-copy")?.addEventListener("click", () => copyText(out, $("#radio-copy")));

    // Example CLI string for a hypothetical local tool
    $("#radio-cli")?.addEventListener("click", () => {
      const cmd = [
        "zzxbbc-cli radio",
        `--region ${sh(region.value)}`,
        `--sf ${sh(sf.value)}`,
        `--bw ${sh(bw.value)}`,
        `--cr ${sh(cr.value)}`,
        `--tx ${sh(tx.value)}`,
        ch.value.trim() ? `--channels ${sh(ch.value.trim())}` : ""
      ].filter(Boolean).join(" ");
      out.value = cmd;
    });
  }

  // Gateway
  function wireGateway() {
    const mode  = $("#gw-mode");
    const url   = $("#gw-url");
    const token = $("#gw-token");
    const out   = $("#gw-out");

    $("#gw-build")?.addEventListener("click", () => {
      const obj = {
        backhaul: {
          mode: mode.value,
          endpoint: url.value.trim(),
          token: token.value.trim() || null
        }
      };
      out.value = j(obj);
    });
    $("#gw-copy")?.addEventListener("click", () => copyText(out, $("#gw-copy")));
  }

  // OTA
  function wireOTA() {
    const chan = $("#ota-channel");
    const fpr  = $("#ota-fpr");
    const out  = $("#ota-out");

    $("#ota-build")?.addEventListener("click", () => {
      out.value = j({
        ota: {
          channel: chan.value,
          signer_fpr: fpr.value.trim()
        }
      });
    });
    $("#ota-copy")?.addEventListener("click", () => copyText(out, $("#ota-copy")));
  }

  /* ---------- utils ---------- */
  function j(o) { return JSON.stringify(o, null, 2); }
  function splitCSV(s) {
    return String(s || "")
      .split(",")
      .map(x => x.trim())
      .filter(Boolean);
  }
  function splitNUM(s) {
    return splitCSV(s).map(v => Number(v)).filter(n => Number.isFinite(n));
  }
  function num(v, d) { const n = Number(v); return Number.isFinite(n) ? n : d; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function sh(s) {
    s = String(s || "");
    return /[\s"']/g.test(s) ? `"${s.replace(/(["\\$`])/g, "\\$1")}"` : s;
  }
})();

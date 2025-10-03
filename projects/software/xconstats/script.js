// XConStats boot: hydrate from manifest + Gamepad API live readout.
// Notes: Requires user gesture to start polling in many browsers.

(function () {
  const $ = (sel) => document.querySelector(sel);

  // DOM
  const titleEl   = $("#project-title");
  const blurbEl   = $("#project-blurb");
  const logoEl    = $("#project-logo");
  const ctaRow    = $("#cta-row");
  const badgesEl  = $("#project-badges");
  const galleryEl = $("#gallery");
  const galHintEl = $("#gallery-hint");

  const startBtn  = $("#start");
  const stopBtn   = $("#stop");
  const rumbleBtn = $("#rumble");
  const deadEl    = $("#deadzone");
  const rateSel   = $("#rate");
  const padsEl    = $("#pads");

  let manifest = null;

  // Buttons
  const addBtn = (text, href, style = "solid") => {
    if (!href) return;
    const a = document.createElement("a");
    a.className = "btn" + (style === "ghost" ? " ghost" : (style === "alt" ? " alt" : ""));
    a.textContent = text;
    a.href = href;
    if (/^https?:\/\//i.test(href)) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
    ctaRow.appendChild(a);
  };

  const addBadge = (label, dot = true) => {
    const b = document.createElement("span");
    b.className = "badge";
    b.innerHTML = (dot ? '<span class="dot"></span>' : '') + label;
    badgesEl.appendChild(b);
  };

  const addImg = (src, alt) => {
    const wrap = document.createElement("figure");
    wrap.className = "image";
    const img = document.createElement("img");
    img.loading = "lazy";
    img.decoding = "async";
    img.src = src;
    img.alt = alt || "XConStats screenshot";
    wrap.appendChild(img);
    galleryEl.appendChild(wrap);
  };

  // Manifest boot
  async function bootManifest() {
    const res = await fetch("./manifest.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    manifest = await res.json();

    if (manifest.title) titleEl.textContent = manifest.title;
    if (manifest.blurb) blurbEl.textContent = manifest.blurb;
    const logo = manifest.logo || (manifest.images && manifest.images[0]);
    if (logo) logoEl.src = logo;

    addBtn("Open", manifest.href || "/projects/software/xconstats/");
    if (manifest.github_url) addBtn("GitHub", manifest.github_url, "ghost");
    if (manifest.docs_url) addBtn("Docs", manifest.docs_url, "ghost");

    const state = (manifest.state || "pre-release").trim();
    addBadge(state === "released" ? "Released" : state[0].toUpperCase() + state.slice(1));
    if (Array.isArray(manifest.versions) && manifest.versions.length) {
      const latest = manifest.versions[0];
      if (latest?.version) addBadge(`v${latest.version}`, false);
    }

    const imgs = Array.isArray(manifest.images) ? manifest.images : [];
    if (!imgs.length) {
      galHintEl.textContent = "No screenshots yet.";
    } else {
      imgs.forEach((src) => addImg(src, manifest.title || "XConStats"));
      galHintEl.textContent = "";
    }
  }

  // ---------- Gamepad
  let rafId = 0;
  let timerId = 0;
  let useRAF = true;
  let pollIntervalMs = 16;
  const cards = new Map(); // index -> DOM elements

  function clampDead(x, dz) {
    const ax = Math.abs(x);
    if (ax < dz) return 0;
    // Optionally re-scale; here we just zero-out inner band.
    return x;
  }

  function number(n, places=2) {
    return (Math.round(n * Math.pow(10, places)) / Math.pow(10, places)).toFixed(places);
  }

  function mkPadCard(pad) {
    const root = document.createElement("article");
    root.className = "pad";
    root.dataset.index = pad.index;

    root.innerHTML = `
      <header>
        <h3>${pad.id}</h3>
        <div class="meta">
          Index <code>#${pad.index}</code> — Mapping <code>${pad.mapping || 'standard'}</code>
        </div>
      </header>

      <div class="row">
        <div class="block">
          <h4>Buttons</h4>
          <div class="buttons" data-part="buttons"></div>
        </div>

        <div class="block">
          <h4>Triggers & Bumpers</h4>
          <div class="bars" data-part="bars">
            <div class="bar"><div class="fill" data-k="LT"></div></div>
            <div class="bar"><div class="fill" data-k="RT"></div></div>
          </div>
          <div class="kv"><span>LT</span><code data-kv="LT">0.00</code></div>
          <div class="kv"><span>RT</span><code data-kv="RT">0.00</code></div>
        </div>
      </div>

      <div class="row">
        <div class="block stick">
          <div class="xy" data-stick="L">
            <div class="crosshair"></div>
            <div class="dot" data-dot="L"></div>
          </div>
          <div class="vals">
            <div class="kv"><span>LX</span><code data-kv="LX">0.00</code></div>
            <div class="kv"><span>LY</span><code data-kv="LY">0.00</code></div>
          </div>
        </div>

        <div class="block stick">
          <div class="xy" data-stick="R">
            <div class="crosshair"></div>
            <div class="dot" data-dot="R"></div>
          </div>
          <div class="vals">
            <div class="kv"><span>RX</span><code data-kv="RX">0.00</code></div>
            <div class="kv"><span>RY</span><code data-kv="RY">0.00</code></div>
          </div>
        </div>
      </div>
    `;

    // Buttons grid: create cells equal to pad.buttons length
    const buttonsWrap = root.querySelector('[data-part="buttons"]');
    for (let i = 0; i < pad.buttons.length; i++) {
      const cell = document.createElement("div");
      cell.className = "btncell";
      cell.dataset.btn = i;
      cell.textContent = i.toString().padStart(2, "0");
      buttonsWrap.appendChild(cell);
    }

    padsEl.appendChild(root);
    cards.set(pad.index, { root });
  }

  function ensureCards() {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
    // Remove missing
    for (const idx of Array.from(cards.keys())) {
      if (!pads.find(p => p.index === idx)) {
        const c = cards.get(idx);
        if (c?.root?.parentNode) c.root.parentNode.removeChild(c.root);
        cards.delete(idx);
      }
    }
    // Add new
    for (const p of pads) {
      if (!cards.has(p.index)) mkPadCard(p);
    }
  }

  function update() {
    ensureCards();

    const dz = Math.max(0, Math.min(0.5, parseFloat(deadEl.value || "0.08")));
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];

    for (const pad of pads) {
      const c = cards.get(pad.index);
      if (!c) continue;
      const root = c.root;

      // Buttons
      const btnCells = root.querySelectorAll(".btncell");
      for (let i = 0; i < btnCells.length; i++) {
        const b = pad.buttons[i];
        const cell = btnCells[i];
        if (!b || !cell) continue;
        cell.classList.toggle("active", !!b.pressed || (b.value ?? 0) > 0.5);
      }

      // Triggers (standard mapping 6=LT, 7=RT for Xbox)
      const lt = (pad.buttons[6]?.value ?? 0);
      const rt = (pad.buttons[7]?.value ?? 0);
      const fillLT = root.querySelector('.fill[data-k="LT"]');
      const fillRT = root.querySelector('.fill[data-k="RT"]');
      if (fillLT) fillLT.style.width = `${Math.round(lt * 100)}%`;
      if (fillRT) fillRT.style.width = `${Math.round(rt * 100)}%`;
      const kvLT = root.querySelector('code[data-kv="LT"]');
      const kvRT = root.querySelector('code[data-kv="RT"]');
      if (kvLT) kvLT.textContent = number(lt);
      if (kvRT) kvRT.textContent = number(rt);

      // Axes (LX=0, LY=1, RX=2, RY=3 on standard mapping)
      const lx = clampDead(pad.axes[0] ?? 0, dz);
      const ly = clampDead(pad.axes[1] ?? 0, dz);
      const rx = clampDead(pad.axes[2] ?? 0, dz);
      const ry = clampDead(pad.axes[3] ?? 0, dz);

      const kvLX = root.querySelector('code[data-kv="LX"]');
      const kvLY = root.querySelector('code[data-kv="LY"]');
      const kvRX = root.querySelector('code[data-kv="RX"]');
      const kvRY = root.querySelector('code[data-kv="RY"]');
      if (kvLX) kvLX.textContent = number(lx);
      if (kvLY) kvLY.textContent = number(ly);
      if (kvRX) kvRX.textContent = number(rx);
      if (kvRY) kvRY.textContent = number(ry);

      // Dots in stick boxes (map -1..1 to container)
      const ldot = root.querySelector('[data-dot="L"]');
      const rdot = root.querySelector('[data-dot="R"]');
      if (ldot) {
        // x: -1..1 maps to 0..100; y inverted for typical screen coords
        const x = (lx * 50);
        const y = (ly * -50);
        ldot.style.left = `calc(50% + ${x}%)`;
        ldot.style.top  = `calc(50% + ${y}%)`;
      }
      if (rdot) {
        const x = (rx * 50);
        const y = (ry * -50);
        rdot.style.left = `calc(50% + ${x}%)`;
        rdot.style.top  = `calc(50% + ${y}%)`;
      }
    }
  }

  function loopRAF() {
    update();
    rafId = requestAnimationFrame(loopRAF);
  }

  function loopTimer() {
    update();
  }

  function start() {
    stop();
    ensureCards();
    const val = rateSel.value;
    if (val === "raf") {
      useRAF = true;
      loopRAF();
    } else {
      useRAF = false;
      pollIntervalMs = Math.max(8, parseInt(val, 10) > 0 ? parseInt(val, 10) : 60);
      timerId = setInterval(loopTimer, pollIntervalMs);
    }
  }

  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    if (timerId) clearInterval(timerId);
    timerId = 0;
  }

  async function rumbleTest() {
    // Try first available pad with vibrationActuator
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
    for (const p of pads) {
      const h = p.vibrationActuator;
      if (h && typeof h.playEffect === "function") {
        try {
          await h.playEffect("dual-rumble", {
            startDelay: 0,
            duration: 350,
            weakMagnitude: 0.7,
            strongMagnitude: 1.0
          });
          return;
        } catch (e) {
          console.warn("Rumble error:", e);
        }
      }
    }
    alert("No haptics actuator found on connected controllers.");
  }

  // Wire events
  startBtn.addEventListener("click", start);
  stopBtn.addEventListener("click", stop);
  rateSel.addEventListener("change", () => {
    if (rafId || timerId) start(); // apply new rate live
  });
  rumbleBtn.addEventListener("click", rumbleTest);

  window.addEventListener("gamepadconnected", (e) => {
    ensureCards();
  });
  window.addEventListener("gamepaddisconnected", (e) => {
    ensureCards();
  });

  // Kick
  (async () => {
    try { await bootManifest(); }
    catch (e) {
      console.error(e);
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = `Failed to load project: ${e.message}`;
      ctaRow.appendChild(p);
    }
  })();
})();

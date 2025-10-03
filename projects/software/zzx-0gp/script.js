// ZZX-0GP — GPG command builder with optional local run.
// Optional API endpoints to implement server-side if desired:
//   POST /api/gpg { cmd }              -> runs raw gpg command (safely sanitize!)
//   POST /api/gpg/encrypt { args... }  -> encrypt wrapper
//   POST /api/gpg/decrypt { args... }  -> decrypt wrapper
// This page will gracefully fall back to "copy command" only if the API is absent.

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
  const historyEl = $("#history");

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

      addBtn("Open", manifest.href || "/projects/software/zzx-0gp/");
      if (manifest.github_url) addBtn("GitHub", manifest.github_url, "ghost");
      if (manifest.docs_url)   addBtn("Docs", manifest.docs_url, "ghost");

      addBadge(cap(manifest.state || "pre-release"));
      if (Array.isArray(manifest.versions) && manifest.versions.length) {
        const latest = manifest.versions[0];
        if (latest?.version) addBadge(`v${latest.version}`, false);
      }

      const imgs = Array.isArray(manifest.images) ? manifest.images : [];
      if (!imgs.length) { galHintEl.textContent = "No screenshots yet."; }
      else {
        imgs.forEach((src) => addImg(src, manifest.title || "ZZX-0GP"));
        galHintEl.textContent = "";
      }

      renderHistory();
      wireForms();
    } catch (e) {
      console.error(e);
      renderHistory();
      wireForms();
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
    img.src = src; img.alt = alt || "ZZX-0GP screenshot";
    wrap.appendChild(img); galleryEl.appendChild(wrap);
  }
  function cap(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }

  /* ---------- helpers ---------- */
  function qsplit(v) {
    return String(v || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
  }
  function pushHist(cmd) {
    try {
      const key = "zzx0gp.history";
      const arr = JSON.parse(localStorage.getItem(key) || "[]");
      arr.unshift({ t: Date.now(), cmd });
      while (arr.length > 40) arr.pop();
      localStorage.setItem(key, JSON.stringify(arr));
      renderHistory();
    } catch {}
  }
  function renderHistory() {
    historyEl.innerHTML = "";
    try {
      const arr = JSON.parse(localStorage.getItem("zzx0gp.history") || "[]");
      arr.forEach(h => {
        const d = new Date(h.t);
        const item = document.createElement("div");
        item.className = "hist-item";
        item.innerHTML = `
          <div class="muted">${d.toLocaleString()}</div>
          <pre><code>${h.cmd}</code></pre>
        `;
        historyEl.appendChild(item);
      });
    } catch {}
  }
  function esc(a) {
    if (/[\s'"$`\\]/.test(a)) return `"${a.replace(/(["\\$`])/g, "\\$1")}"`;
    return a;
  }
  function setSwapVisibility(groupSel, valueAttr, chosen) {
    $$(groupSel).forEach(el => {
      const val = el.getAttribute(valueAttr);
      const show = val ? val === chosen : true;
      el.hidden = !show;
    });
  }

  async function tryLocalRun(cmd, noteBtn) {
    if (!cmd.trim()) return;
    noteBtn.disabled = true;
    const lbl = noteBtn.textContent;
    noteBtn.textContent = "Running…";
    try {
      const res = await fetch("/api/gpg", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cmd })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      noteBtn.textContent = "Done";
    } catch {
      noteBtn.textContent = "API not found — use CLI";
    } finally {
      setTimeout(() => { noteBtn.disabled = false; noteBtn.textContent = lbl; }, 1400);
    }
  }

  /* ---------- forms ---------- */
  function wireForms() {
    // Encrypt
    const enc = {
      recips:  $("#enc-recips"),
      armor:   $("#enc-armor"),
      cipher:  $("#enc-cipher"),
      comp:    $("#enc-compress"),
      inFile:  $("#enc-file"),
      inText:  $("#enc-text"),
      out:     $("#enc-out"),
      cmd:     $("#enc-cmd"),
      build:   $("#enc-build"),
      copy:    $("#enc-copy"),
      run:     $("#enc-run"),
    };

    const encInputRadios = $$('input[name="enc-input"]');
    const encFileWrap = $('[data-input="file"]');
    const encTextWrap = $('[data-input="text"]');

    encInputRadios.forEach(r => r.addEventListener("change", () => {
      const mode = encInputRadios.find(x => x.checked)?.value || "file";
      encFileWrap.hidden = mode !== "file";
      encTextWrap.hidden = mode !== "text";
    }));

    enc.build.addEventListener("click", () => {
      const recips = qsplit(enc.recips.value);
      const parts = ["gpg", "--batch", "--yes", "--encrypt"];
      if (enc.armor.checked) parts.push("--armor");
      if (enc.cipher.value) parts.push("--cipher-algo", enc.cipher.value);
      if (enc.comp.value)   parts.push("--compress-level", enc.comp.value);
      recips.forEach(r => parts.push("-r", r));

      const out = enc.out.value.trim();
      if (out) parts.push("-o", out);

      const mode = encInputRadios.find(x => x.checked)?.value || "file";
      if (mode === "file") {
        const path = enc.inFile.value.trim();
        if (path) parts.push(esc(path));
      } else {
        // text via stdin
        parts.push("--output", out || "-", "--batch");
        // show an echo pipeline users can paste
        const text = enc.inText.value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        enc.cmd.value = `echo "${text}" | ${parts.join(" ")}`;
        pushHist(enc.cmd.value);
        return;
      }

      enc.cmd.value = parts.join(" ");
      pushHist(enc.cmd.value);
    });

    enc.copy.addEventListener("click", async () => {
      const t = enc.cmd.value.trim(); if (!t) return;
      try { await navigator.clipboard.writeText(t); enc.copy.textContent = "Copied!"; }
      catch { /* noop */ }
      setTimeout(() => (enc.copy.textContent = "Copy"), 900);
    });
    enc.run.addEventListener("click", () => tryLocalRun(enc.cmd.value, enc.run));

    // Decrypt
    const dec = {
      in:   $("#dec-in"),
      out:  $("#dec-out"),
      quiet:$("#dec-quiet"),
      cmd:  $("#dec-cmd"),
      build:$("#dec-build"),
      copy: $("#dec-copy"),
      run:  $("#dec-run"),
    };
    dec.build.addEventListener("click", () => {
      const parts = ["gpg", "--batch", "--yes", "--decrypt"];
      if (dec.quiet.checked) parts.push("-q");
      const out = dec.out.value.trim();
      if (out) parts.push("-o", out);
      const input = dec.in.value.trim();
      if (input) parts.push(esc(input));
      dec.cmd.value = parts.join(" ");
      pushHist(dec.cmd.value);
    });
    dec.copy.addEventListener("click", async () => {
      const t = dec.cmd.value.trim(); if (!t) return;
      try { await navigator.clipboard.writeText(t); dec.copy.textContent = "Copied!"; }
      catch {}
      setTimeout(() => (dec.copy.textContent = "Copy"), 900);
    });
    dec.run.addEventListener("click", () => tryLocalRun(dec.cmd.value, dec.run));

    // Sign/Verify
    const sig = {
      mode: () => $$('input[name="sig-mode"]:checked')[0]?.value || "attached",
      armor: $("#sig-armor"),
      in:    $("#sig-in"),
      det:   $("#sig-det"),
      uid:   $("#sig-uid"),
      cmd:   $("#sig-cmd"),
      build: $("#sig-build"),
      copy:  $("#sig-copy"),
      run:   $("#sig-run"),
    };
    sig.build.addEventListener("click", () => {
      const m = sig.mode();
      const parts = ["gpg", "--batch", "--yes"];
      if (m === "verify") {
        parts.push("--verify");
        const det = sig.det.value.trim();
        if (det) parts.push(esc(det));
        const input = sig.in.value.trim();
        if (input) parts.push(esc(input));
      } else if (m === "detach") {
        if (sig.armor.checked) parts.push("--armor");
        if (sig.uid.value.trim()) parts.push("--local-user", sig.uid.value.trim());
        parts.push("--detach-sign");
        const input = sig.in.value.trim();
        if (input) parts.push(esc(input));
      } else {
        // attached
        if (sig.armor.checked) parts.push("--armor");
        if (sig.uid.value.trim()) parts.push("--local-user", sig.uid.value.trim());
        parts.push("--sign");
        const input = sig.in.value.trim();
        if (input) parts.push(esc(input));
      }
      sig.cmd.value = parts.join(" ");
      pushHist(sig.cmd.value);
    });
    sig.copy.addEventListener("click", async () => {
      const t = sig.cmd.value.trim(); if (!t) return;
      try { await navigator.clipboard.writeText(t); sig.copy.textContent = "Copied!"; }
      catch {}
      setTimeout(() => (sig.copy.textContent = "Copy"), 900);
    });
    sig.run.addEventListener("click", () => tryLocalRun(sig.cmd.value, sig.run));

    // Keys
    const key = {
      op:   $("#key-op"),
      uid:  $("#key-uid"),
      kid:  $("#key-id"),
      armor:$("#key-armor"),
      type: $("#key-type"),
      exp:  $("#key-exp"),
      path: $("#key-path"),
      cmd:  $("#key-cmd"),
      build:$("#key-build"),
      copy: $("#key-copy"),
      run:  $("#key-run"),
    };

    function refreshKeyVis() {
      const v = key.op.value;
      setSwapVisibility('[data-kop]', 'data-kop', v);
    }
    key.op.addEventListener("change", refreshKeyVis);
    refreshKeyVis();

    key.build.addEventListener("click", () => {
      const op = key.op.value;
      const parts = ["gpg", "--batch", "--yes"];
      if (op === "list") {
        parts.push("--list-keys");
        const uid = key.uid.value.trim();
        if (uid) parts.push(uid);
      } else if (op === "gen") {
        // non-interactive quick-gen
        const uid = key.uid.value.trim() || "user@example.com";
        const ty  = key.type.value;
        const exp = key.exp.value.trim() || "2y";
        let algo = "ed25519/cert,ed25519/sign,cv25519/encr";
        if (ty === "rsa4096") algo = "rsa4096";
        if (ty === "rsa3072") algo = "rsa3072";
        const qp = `Name-Real: ${uid}
Name-Email: ${uid}
Expire-Date: ${exp}
%no-protection
%commit
`;
        // show a heredoc pattern so users can reproduce:
        key.cmd.value =
`cat >genkey.batch <<'EOF'
Key-Type: ${algo}
${ty.startsWith("rsa") ? "Key-Length: " + ty.replace("rsa","") : ""}
Name-Real: ${uid}
Name-Email: ${uid}
Expire-Date: ${exp}
%commit
EOF
gpg --batch --gen-key genkey.batch`;
        pushHist(key.cmd.value);
        return;
      } else if (op === "import") {
        parts.push("--import");
        const p = key.path.value.trim();
        if (p) parts.push(esc(p));
      } else if (op === "export") {
        if (key.armor.checked) parts.push("--armor");
        parts.push("--export");
        const uid = key.uid.value.trim() || key.kid.value.trim();
        if (uid) parts.push(uid);
        const p = key.path.value.trim();
        if (p) parts.push(">", esc(p)); // display redirection as guidance
      } else if (op === "export-sec") {
        if (key.armor.checked) parts.push("--armor");
        parts.push("--export-secret-keys");
        const uid = key.uid.value.trim() || key.kid.value.trim();
        if (uid) parts.push(uid);
        const p = key.path.value.trim();
        if (p) parts.push(">", esc(p));
      } else if (op === "revoke") {
        const uid = key.uid.value.trim() || key.kid.value.trim();
        if (uid) {
          key.cmd.value = `gpg --output ${esc(key.path.value.trim() || "revocation.asc")} --gen-revoke ${esc(uid)}`;
          pushHist(key.cmd.value);
          return;
        }
      } else if (op === "publish") {
        const uid = key.uid.value.trim() || key.kid.value.trim();
        if (uid) {
          key.cmd.value = `gpg --keyserver keyserver.ubuntu.com --send-keys ${esc(uid)}`;
          pushHist(key.cmd.value);
          return;
        }
      }

      key.cmd.value = parts.join(" ");
      pushHist(key.cmd.value);
    });
    key.copy.addEventListener("click", async () => {
      const t = key.cmd.value.trim(); if (!t) return;
      try { await navigator.clipboard.writeText(t); key.copy.textContent = "Copied!"; }
      catch {}
      setTimeout(() => (key.copy.textContent = "Copy"), 900);
    });
    key.run.addEventListener("click", () => tryLocalRun(key.cmd.value, key.run));

    // SSH
    const ssh = {
      op: $("#ssh-op"),
      id: $("#ssh-id"),
      cmd: $("#ssh-cmd"),
      build: $("#ssh-build"),
      copy: $("#ssh-copy"),
      run: $("#ssh-run"),
    };
    ssh.build.addEventListener("click", () => {
      const op = ssh.op.value;
      const id = ssh.id.value.trim();
      if (op === "list") {
        ssh.cmd.value = "gpg --card-status || gpg --list-keys";
      } else if (op === "export-ssh") {
        // Using gpg-agent with enable-ssh-support: show common export path
        ssh.cmd.value = `ssh-add -L # if using gpg-agent as ssh-agent (enable-ssh-support)\n# or for RFC6637 subkey export (ed25519->ssh not direct):\n# gpg --export-ssh-key ${esc(id || "alice@example.com")} > ~/.ssh/id_rsa_gpg.pub`;
      } else {
        ssh.cmd.value = `ssh-add -L >> ~/.ssh/authorized_keys`;
      }
      pushHist(ssh.cmd.value);
    });
    ssh.copy.addEventListener("click", async () => {
      const t = ssh.cmd.value.trim(); if (!t) return;
      try { await navigator.clipboard.writeText(t); ssh.copy.textContent = "Copied!"; }
      catch {}
      setTimeout(() => (ssh.copy.textContent = "Copy"), 900);
    });
    ssh.run.addEventListener("click", () => tryLocalRun(ssh.cmd.value, ssh.run));
  }
})();

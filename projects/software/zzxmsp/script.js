// ZZX-MSP — Manifest wiring + local runbook/policy/status generators (browser-only).
(function () {
  const $  = (s) => document.querySelector(s);

  const titleEl   = $("#project-title");
  const blurbEl   = $("#project-blurb");
  const logoEl    = $("#project-logo");
  const ctaRow    = $("#cta-row");
  const badgesEl  = $("#project-badges");
  const galleryEl = $("#gallery");
  const galHintEl = $("#gallery-hint");
  const out       = $("#out-artifacts");

  let manifest = null;

  /* ---------- boot ---------- */
  (async function boot() {
    try {
      const res = await fetch("./manifest.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      manifest = await res.json();

      if (manifest.title) titleEl.textContent = manifest.title;
      if (manifest.blurb) blurbEl.textContent = manifest.blurb;
      const logo = manifest.logo || (manifest.images && manifest.images[0]);
      if (logo) logoEl.src = logo;

      addBtn("Open", manifest.href || "/projects/software/zzxmsp/");
      if (manifest.github_url) addBtn("GitHub", manifest.github_url, "ghost");
      if (manifest.docs_url)   addBtn("Docs", manifest.docs_url, "ghost");

      addBadge(cap(manifest.state || "research"));
      if (Array.isArray(manifest.versions) && manifest.versions.length) {
        const latest = manifest.versions[0];
        if (latest?.version) addBadge(`v${latest.version}`, false);
      }

      const imgs = Array.isArray(manifest.images) ? manifest.images : [];
      if (!imgs.length) { galHintEl.textContent = "No screenshots yet."; }
      else {
        imgs.forEach((src) => addImg(src, manifest.title || "ZZX-MSP"));
        galHintEl.textContent = "";
      }

    } catch (e) {
      console.error(e);
      galHintEl.textContent = "Manifest failed to load.";
    }

    wireActions();
  })();

  /* ---------- UI helpers ---------- */
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
    img.src = src; img.alt = alt || "ZZX-MSP image";
    wrap.appendChild(img); galleryEl.appendChild(wrap);
  }
  function cap(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }
  function copyToClipboard(text) {
    return navigator.clipboard.writeText(text).catch(()=>{});
  }

  /* ---------- Inputs ---------- */
  function inputs() {
    const name    = $("#tenant-name").value.trim() || "acme-corp";
    const env     = $("#tenant-env").value || "prod";
    const contact = $("#tenant-contact").value.trim() || "oncall@example.com";
    const window  = $("#tenant-window").value.trim() || "Sat 01:00-03:00";
    const pick = (step) => !!document.querySelector(`input[data-step="${step}"]`)?.checked;

    return {
      name, env, contact, window,
      steps: {
        ping: pick("ping"),
        http: pick("http"),
        metrics: pick("metrics"),
        logs: pick("logs"),
        pg_backup: pick("pg_backup"),
        files_backup: pick("files_backup"),
        verify: pick("verify"),
        restore_test: pick("restore_test"),
        os_updates: pick("os_updates"),
        pkg_updates: pick("pkg_updates"),
        svc_restart: pick("svc_restart"),
        jit_creds: pick("jit_creds"),
        session_record: pick("session_record"),
        approvals: pick("approvals")
      }
    };
  }

  /* ---------- Generators ---------- */
  function runbookYaml() {
    const { name, env, contact, window, steps } = inputs();

    const lines = [
      `# ZZX-MSP runbook`,
      `tenant: ${name}`,
      `environment: ${env}`,
      `maintenance_window: "${window}"`,
      `contact: "${contact}"`,
      `steps:`
    ];

    if (steps.ping) lines.push(
`  - id: ping
    title: L4 reachability
    action: "ansible -m ping all -i inventories/${name}/${env}.ini"`);

    if (steps.http) lines.push(
`  - id: http
    title: HTTP health checks
    action: "zzxmsp http-check --tenant ${name} --env ${env} --follow-redirects"`);

    if (steps.metrics) lines.push(
`  - id: metrics
    title: Metrics collectors
    action: "promtool check rules /etc/prometheus/rules/${name}.yml"`);

    if (steps.logs) lines.push(
`  - id: logs
    title: Log shipping
    action: "zzxmsp logs test --tenant ${name} --env ${env}"`);

    if (steps.pg_backup) lines.push(
`  - id: pg_backup
    title: Postgres nightly backup
    window: "${window}"
    action: "pg_dump --clean --if-exists $PGURL | zstd -T0 > /backups/${name}/pg/latest.sql.zst"`);

    if (steps.files_backup) lines.push(
`  - id: files_backup
    title: Files snapshot
    window: "${window}"
    action: "mc mirror --overwrite /data/${name} s3/${name}/data"`);

    if (steps.verify) lines.push(
`  - id: verify
    title: Backup integrity verify
    action: "zzxmsp backup verify --tenant ${name}"`);

    if (steps.restore_test) lines.push(
`  - id: restore_test
    title: Quarterly restore drill
    action: "zzxmsp backup restore --tenant ${name} --dry-run"`);

    if (steps.os_updates) lines.push(
`  - id: os_updates
    title: OS security updates
    window: "${window}"
    action: "ansible-playbook playbooks/os-updates.yml -e tenant=${name} env=${env}"`);

    if (steps.pkg_updates) lines.push(
`  - id: pkg_updates
    title: Package updates
    window: "${window}"
    action: "ansible-playbook playbooks/pkg-updates.yml -e tenant=${name} env=${env}"`);

    if (steps.svc_restart) lines.push(
`  - id: svc_restart
    title: Safe service restarts
    action: "zzxmsp restart --tenant ${name} --env ${env} --stagger"`);

    if (steps.jit_creds) lines.push(
`  - id: jit_creds
    title: Just-in-time credentials
    action: "zzxmsp access grant --tenant ${name} --env ${env} --ttl 30m --role operator"`);

    if (steps.session_record) lines.push(
`  - id: session_record
    title: Session recording
    action: "zzxmsp access record --tenant ${name} --env ${env} --enable"`);

    if (steps.approvals) lines.push(
`  - id: approvals
    title: Approval gate (prod)
    condition: "env == 'prod'"
    action: "zzxmsp approve --tenant ${name} --change $CHANGE_ID"`);

    return lines.join("\n") + "\n";
  }

  function policyJson() {
    const { name, env } = inputs();
    const obj = {
      version: 1,
      tenant: name,
      env,
      rbac: {
        roles: {
          viewer:   ["read:metrics", "read:logs", "read:inventory"],
          operator: ["read:*", "run:runbook", "access:jit", "restart:service"],
          admin:    ["*"]
        }
      },
      approvals: {
        required: (env === "prod"),
        methods: ["u2f", "otp"],
        quorum: 1
      },
      logging: {
        redact: ["secrets", "tokens", "passwords"],
        retain_days: (env === "prod" ? 90 : 30)
      }
    };
    return JSON.stringify(obj, null, 2) + "\n";
  }

  function statusMarkdown() {
    const { name, env, contact } = inputs();
    const now = new Date().toISOString();
    return [
      `# ${name} — ${env} status`,
      ``,
      `**Updated:** ${now}`,
      ``,
      `- Availability: _OK_`,
      `- Incidents: _None_`,
      `- Maintenance: _Scheduled as posted_`,
      ``,
      `**Contact:** ${contact}`,
      ``,
      `> Generated by ZZX-MSP.`,
      ``
    ].join("\n");
  }

  /* ---------- Actions ---------- */
  function wireActions() {
    $("#btn-playbook")?.addEventListener("click", () => { out.value = runbookYaml(); });
    $("#btn-policy")?.addEventListener("click", () => { out.value = policyJson(); });
    $("#btn-status")?.addEventListener("click", () => { out.value = statusMarkdown(); });
    $("#btn-copy")?.addEventListener("click", () => {
      const t = out.value.trim(); if (!t) return;
      navigator.clipboard.writeText(t).then(() => flash($("#btn-copy"), "Copied!"));
    });
    $("#btn-clear")?.addEventListener("click", () => { out.value = ""; });
  }

  function flash(btn, text) {
    if (!btn) return;
    const old = btn.textContent;
    btn.textContent = text;
    setTimeout(()=> btn.textContent = old, 900);
  }
})();

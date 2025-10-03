// ZZX-Core — Stack builder, manifest wiring, artifact generators (client-side only).
(function () {
  const $  = (s) => document.querySelector(s);

  const titleEl   = $("#project-title");
  const blurbEl   = $("#project-blurb");
  const logoEl    = $("#project-logo");
  const ctaRow    = $("#cta-row");
  const badgesEl  = $("#project-badges");
  const galleryEl = $("#gallery");
  const galHintEl = $("#gallery-hint");

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

      addBtn("Open", manifest.href || "/projects/software/zzxcore/");
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
        imgs.forEach((src) => addImg(src, manifest.title || "ZZX-Core"));
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
    img.src = src; img.alt = alt || "ZZX-Core image";
    wrap.appendChild(img); galleryEl.appendChild(wrap);
  }
  function cap(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }
  function copyToClipboard(text) {
    return navigator.clipboard.writeText(text).catch(()=>{});
  }

  /* ---------- Stack builder actions ---------- */
  function wireActions() {
    const out  = $("#out-artifacts");
    $("#btn-compose")?.addEventListener("click", () => {
      out.value = composeYml();
    });
    $("#btn-env")?.addEventListener("click", () => {
      out.value = envFile();
    });
    $("#btn-systemd")?.addEventListener("click", () => {
      out.value = systemdUnit();
    });
    $("#btn-nginx")?.addEventListener("click", () => {
      out.value = nginxServerBlock();
    });
    $("#btn-copy")?.addEventListener("click", () => {
      const t = out.value.trim(); if (!t) return;
      copyToClipboard(t).then(() => flash($("#btn-copy"), "Copied!"));
    });
    $("#btn-clear")?.addEventListener("click", () => { out.value = ""; });
  }

  function flash(btn, text) {
    if (!btn) return;
    const old = btn.textContent;
    btn.textContent = text;
    setTimeout(()=> btn.textContent = old, 900);
  }

  /* ---------- inputs ---------- */
  function inputVals() {
    const name   = $("#proj-name").value.trim() || "zzx-demo";
    const domain = ($("#proj-domain").value.trim() || "demo.zzx.local").toLowerCase();
    const email  = $("#proj-email").value.trim() || "admin@example.com";
    const proxy  = $("#proxy-kind").value;
    const root   = $("#proj-root").value.trim() || `/srv/zzxcore/${name}`;
    const tz     = $("#proj-tz").value.trim() || "UTC";

    // Services toggled
    const pick = (key) => !!document.querySelector(`input[data-svc="${key}"]`)?.checked;
    const svc = {
      node: pick("node"),
      python: pick("python"),
      go: pick("go"),
      php: pick("php"),
      static: pick("static"),
      postgres: pick("postgres"),
      redis: pick("redis"),
      minio: pick("minio"),
      rabbitmq: pick("rabbitmq"),
      prometheus: pick("prometheus"),
      grafana: pick("grafana"),
      loki: pick("loki"),
      tempo: pick("tempo"),
      cadvisor: pick("cadvisor"),
    };

    return { name, domain, email, proxy, root, tz, svc };
  }

  /* ---------- generators ---------- */
  function composeYml() {
    const { name, domain, email, proxy, root, tz, svc } = inputVals();

    const header = [
      `version: "3.9"`,
      `name: ${name}`,
      `services:`
    ];

    const lines = [];

    // Reverse proxy block (Traefik default)
    if (proxy === "traefik") {
      lines.push(
`  traefik:
    image: traefik:v3.0
    command:
      - --api.dashboard=true
      - --providers.docker=true
      - --entrypoints.web.address=:80
      - --entrypoints.websecure.address=:443
      - --certificatesresolvers.le.acme.tlschallenge=true
      - --certificatesresolvers.le.acme.email=${email}
      - --certificatesresolvers.le.acme.storage=/letsencrypt/acme.json
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ${root}/letsencrypt:/letsencrypt
    restart: unless-stopped`);
    } else if (proxy === "caddy") {
      lines.push(
`  caddy:
    image: caddy:2
    ports:
      - "80:80"
      - "443:443"
    environment:
      - ACME_AGREE=true
      - TZ=${tz}
    volumes:
      - ${root}/caddy/Caddyfile:/etc/caddy/Caddyfile
      - ${root}/caddy/data:/data
      - ${root}/caddy/config:/config
    restart: unless-stopped`);
    } else {
      lines.push(
`  nginx:
    image: nginx:stable
    ports:
      - "80:80"
    volumes:
      - ${root}/nginx/conf.d:/etc/nginx/conf.d
      - ${root}/nginx/html:/usr/share/nginx/html:ro
    restart: unless-stopped`);
    }

    // Runtimes
    if (svc.node) {
      lines.push(
`  app-node:
    image: node:20-alpine
    working_dir: /app
    command: sh -c "npm ci && npm run start"
    environment:
      - NODE_ENV=production
      - TZ=${tz}
    volumes:
      - ${root}/apps/node:/app
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.${name}-node.rule=Host(\`${domain}\`)"
      - "traefik.http.services.${name}-node.loadbalancer.server.port=3000"
    restart: unless-stopped`);
    }

    if (svc.python) {
      lines.push(
`  app-py:
    image: python:3.12-alpine
    working_dir: /app
    command: sh -c "pip install -r requirements.txt && uvicorn app:app --host 0.0.0.0 --port 8000"
    environment:
      - TZ=${tz}
    volumes:
      - ${root}/apps/python:/app
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.${name}-py.rule=Host(\`api.${domain}\`)"
      - "traefik.http.services.${name}-py.loadbalancer.server.port=8000"
    restart: unless-stopped`);
    }

    if (svc.go) {
      lines.push(
`  app-go:
    image: golang:1.22-alpine
    working_dir: /app
    command: sh -c "go build -o server ./... && ./server -addr :8080"
    environment:
      - TZ=${tz}
    volumes:
      - ${root}/apps/go:/app
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.${name}-go.rule=Host(\`go.${domain}\`)"
      - "traefik.http.services.${name}-go.loadbalancer.server.port=8080"
    restart: unless-stopped`);
    }

    if (svc.static) {
      lines.push(
`  app-static:
    image: caddy:2
    volumes:
      - ${root}/apps/static:/srv
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.${name}-static.rule=Host(\`static.${domain}\`)"
      - "traefik.http.services.${name}-static.loadbalancer.server.port=80"
    restart: unless-stopped`);
    }

    if (svc.php) {
      lines.push(
`  app-php:
    image: php:8.3-fpm-alpine
    volumes:
      - ${root}/apps/php:/var/www/html
    restart: unless-stopped

  php-nginx:
    image: nginx:stable
    depends_on: [app-php]
    volumes:
      - ${root}/apps/php:/var/www/html
      - ${root}/nginx/php.conf:/etc/nginx/conf.d/default.conf
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.${name}-php.rule=Host(\`php.${domain}\`)"
      - "traefik.http.services.${name}-php.loadbalancer.server.port=80"
    restart: unless-stopped`);
    }

    // Data & Queues
    if (svc.postgres) {
      lines.push(
`  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_PASSWORD=\${POSTGRES_PASSWORD}
      - POSTGRES_USER=\${POSTGRES_USER:-zzx}
      - POSTGRES_DB=\${POSTGRES_DB:-zzxdb}
      - TZ=${tz}
    volumes:
      - ${root}/data/postgres:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    restart: unless-stopped`);
    }

    if (svc.redis) {
      lines.push(
`  redis:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - ${root}/data/redis:/data
    ports:
      - "6379:6379"
    restart: unless-stopped`);
    }

    if (svc.minio) {
      lines.push(
`  minio:
    image: quay.io/minio/minio:RELEASE.2024-07-15T18-04-37Z
    command: server /data --console-address ":9001"
    environment:
      - MINIO_ROOT_USER=\${MINIO_ROOT_USER}
      - MINIO_ROOT_PASSWORD=\${MINIO_ROOT_PASSWORD}
    volumes:
      - ${root}/data/minio:/data
    ports:
      - "9000:9000"
      - "9001:9001"
    restart: unless-stopped`);
    }

    if (svc.rabbitmq) {
      lines.push(
`  rabbitmq:
    image: rabbitmq:3-management
    environment:
      - RABBITMQ_DEFAULT_USER=\${RABBIT_USER:-zzx}
      - RABBITMQ_DEFAULT_PASS=\${RABBIT_PASS}
    ports:
      - "5672:5672"
      - "15672:15672"
    volumes:
      - ${root}/data/rabbitmq:/var/lib/rabbitmq
    restart: unless-stopped`);
    }

    // Observability
    if (svc.prometheus) {
      lines.push(
`  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ${root}/obs/prometheus:/etc/prometheus
      - ${root}/data/prometheus:/prometheus
    ports:
      - "9090:9090"
    restart: unless-stopped`);
    }

    if (svc.grafana) {
      lines.push(
`  grafana:
    image: grafana/grafana:latest
    environment:
      - GF_SERVER_DOMAIN=${domain}
      - GF_SECURITY_ADMIN_PASSWORD=\${GRAFANA_PASS}
    volumes:
      - ${root}/obs/grafana:/var/lib/grafana
    ports:
      - "3001:3000"
    restart: unless-stopped`);
    }

    if (svc.loki) {
      lines.push(
`  loki:
    image: grafana/loki:2.9.8
    command: -config.file=/etc/loki/local-config.yaml
    volumes:
      - ${root}/obs/loki:/loki
    ports:
      - "3100:3100"
    restart: unless-stopped`);
    }

    if (svc.tempo) {
      lines.push(
`  tempo:
    image: grafana/tempo:2.4.1
    command: [ "-config.file=/etc/tempo.yaml" ]
    volumes:
      - ${root}/obs/tempo:/var/tempo
    ports:
      - "3200:3200"
    restart: unless-stopped`);
    }

    if (svc.cadvisor) {
      lines.push(
`  cadvisor:
    image: gcr.io/cadvisor/cadvisor:v0.49.1
    privileged: true
    devices:
      - /dev/kmsg
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
    ports:
      - "8082:8080"
    restart: unless-stopped`);
    }

    return [...header, ...lines].join("\n");
  }

  function envFile() {
    return [
      `# ---- ZZX-Core .env ----`,
      `POSTGRES_PASSWORD=${rand(16)}`,
      `POSTGRES_USER=zzx`,
      `POSTGRES_DB=zzxdb`,
      `MINIO_ROOT_USER=zzxadmin`,
      `MINIO_ROOT_PASSWORD=${rand(20)}`,
      `RABBIT_PASS=${rand(16)}`,
      `GRAFANA_PASS=${rand(16)}`,
      ``,
    ].join("\n");
  }

  function systemdUnit() {
    const { name } = inputVals();
    return [
      `[Unit]`,
      `Description=ZZX-Core (${name})`,
      `After=network.target docker.service`,
      `Requires=docker.service`,
      ``,
      `[Service]`,
      `Type=oneshot`,
      `RemainAfterExit=yes`,
      `WorkingDirectory=/srv/zzxcore/${name}`,
      `ExecStart=/usr/bin/docker compose up -d`,
      `ExecStop=/usr/bin/docker compose down`,
      `TimeoutStartSec=0`,
      ``,
      `[Install]`,
      `WantedBy=multi-user.target`,
      ``,
    ].join("\n");
  }

  function nginxServerBlock() {
    const { domain } = inputVals();
    return [
      `server {`,
      `  listen 80;`,
      `  server_name ${domain};`,
      `  location / {`,
      `    proxy_pass http://127.0.0.1:3000;`,
      `    proxy_set_header Host $host;`,
      `    proxy_set_header X-Real-IP $remote_addr;`,
      `    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`,
      `    proxy_set_header X-Forwarded-Proto $scheme;`,
      `  }`,
      `}`,
      ``,
    ].join("\n");
  }

  /* ---------- utils ---------- */
  function rand(n) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let s = ""; for (let i = 0; i < n; i++) s += alphabet[(Math.random()*alphabet.length)|0];
    return s;
  }
})();

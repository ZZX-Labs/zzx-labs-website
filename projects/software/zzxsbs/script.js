// ZZX-SBS — Manifest wiring + in-browser mini builder.
// Loads ./manifest.json for hero + links; provides a client-side generator to
// create manifest.json, index.html, style.css, and script.js for a new project.

(function () {
  const $ = (s) => document.querySelector(s);

  const titleEl   = $("#project-title");
  const blurbEl   = $("#project-blurb");
  const logoEl    = $("#project-logo");
  const ctaRow    = $("#cta-row");
  const badgesEl  = $("#project-badges");
  const galleryEl = $("#gallery");
  const galHintEl = $("#gallery-hint");

  const FIELDS = {
    title:   $("#f-title"),
    slug:    $("#f-slug"),
    kind:    $("#f-kind"),
    state:   $("#f-state"),
    license: $("#f-license"),
    blurb:   $("#f-blurb"),
    tags:    $("#f-tags"),
    href:    $("#f-href"),
    logo:    $("#f-logo"),
    desc:    $("#f-desc"),

    website: $("#f-website"),
    github:  $("#f-github"),
    docs:    $("#f-docs"),
    hf:      $("#f-hf"),
    readme:  $("#f-readme"),
    licurl:  $("#f-licurl"),
    demo:    $("#f-demo"),
    dl:      $("#f-dl"),

    images:    $("#f-images"),
    media:     $("#f-media"),
    resources: $("#f-resources"),
    downloads: $("#f-downloads"),
    versions:  $("#f-versions")
  };

  const OUT = {
    manifest: $("#out-manifest"),
    index:    $("#out-index"),
    style:    $("#out-style"),
    script:   $("#out-script"),
    hint:     $("#gen-hint")
  };

  /* ---------- boot: render this project's hero from its own manifest ---------- */
  (async function boot() {
    try {
      const res = await fetch("./manifest.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const m = await res.json();

      if (m.title) titleEl.textContent = m.title;
      if (m.blurb) blurbEl.textContent = m.blurb;
      const logo = m.logo || (Array.isArray(m.images) && m.images[0]);
      if (logo) logoEl.src = logo;

      addBtn("Open", m.href);
      addBtn("GitHub", m.github_url, "ghost");
      addBtn("Docs", m.docs_url, "ghost");
      addBtn("Website", m.website_url, "ghost");

      addBadge(cap(m.state || "alpha"));
      const latest = normalizeVersions(m.versions || [])[0];
      if (latest?.version) addBadge(`v${latest.version}`, false);

      const media = mergeMedia(m.images, m.media);
      if (!media.length) galHintEl.textContent = "No screenshots yet.";
      else {
        galHintEl.textContent = "";
        media.forEach(addMedia);
      }

      wireFormHelpers();
      wireActions();
    } catch (e) {
      console.error(e);
      galHintEl.textContent = "Manifest failed to load.";
    }
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
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
  function escAttr(s) { return String(s).replace(/"/g, '&quot;'); }
  function normalizeVersions(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map(v => (typeof v === "string" ? {version: v} : v)).filter(Boolean);
  }

  /* ---------- Mini builder ---------- */
  function wireFormHelpers() {
    // auto slug from title if user hasn't edited slug
    let touchedSlug = false;
    FIELDS.slug.addEventListener("input", () => { touchedSlug = true; });
    FIELDS.title.addEventListener("input", () => {
      if (!touchedSlug) {
        FIELDS.slug.value = slugify(FIELDS.title.value);
      }
      // auto href if empty or default shape
      const kind = FIELDS.kind.value || "software";
      const slug = FIELDS.slug.value || slugify(FIELDS.title.value);
      if (!FIELDS.href.value || FIELDS.href.value.startsWith("/projects/")) {
        FIELDS.href.value = slug ? `/projects/${slugify(kind)}/${slug}/` : "";
      }
    });
    FIELDS.kind.addEventListener("change", () => {
      const kind = FIELDS.kind.value || "software";
      const slug = FIELDS.slug.value || slugify(FIELDS.title.value);
      if (!FIELDS.href.value || FIELDS.href.value.startsWith("/projects/")) {
        FIELDS.href.value = slug ? `/projects/${slugify(kind)}/${slug}/` : "";
      }
    });
  }

  function readListLines(textarea) {
    return (textarea.value || "")
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean);
  }
  function parseCSV(input) {
    return (input || "").split(",").map(s => s.trim()).filter(Boolean);
  }
  function parseKV(lines) {
    return lines.map(line => {
      const i = line.indexOf("|");
      if (i === -1) return null;
      return { label: line.slice(0,i).trim(), url: line.slice(i+1).trim() };
    }).filter(Boolean);
  }
  function parseMedia(lines) {
    return lines.map(line => {
      const parts = line.split("|").map(s => s.trim());
      if (parts.length === 1) {
        const src = parts[0];
        return /\.(mp4|webm|mov)(\?|$)/i.test(src) ? { type: "video", src } : { type: "image", src };
      }
      const t = (parts[0] || "image").toLowerCase();
      if (t === "video") return { type: "video", src: parts[1] || "", ...(parts[2] ? {poster: parts[2]} : {}) };
      if (t === "embed") return { type: "embed", src: parts[1] || "" };
      return { type: "image", src: parts[1] || "" };
    });
  }
  function parseVersions(lines) {
    return lines.map(line => {
      const parts = line.split("|").map(s => s.trim());
      if (!parts[0]) return null;
      const obj = { version: parts[0] };
      if (parts[1]) obj.date = parts[1];
      if (parts[2]) obj.notes = parts[2];
      return obj;
    }).filter(Boolean);
  }
  function slugify(s) {
    s = String(s || "").trim().toLowerCase();
    s = s.replace(/[^a-z0-9]+/g, "-").replace(/-{2,}/g, "-");
    return s.replace(/^-+|-+$/g, "").slice(0, 96) || "project";
  }

  function buildManifestFromForm() {
    const title = FIELDS.title.value.trim();
    const slug  = (FIELDS.slug.value.trim() || slugify(title));
    const kind  = FIELDS.kind.value || "software";

    const m = {
      slug,
      title,
      blurb: FIELDS.blurb.value.trim(),
      description: FIELDS.desc.value.trim(),
      state: FIELDS.state.value,
      license: FIELDS.license.value.trim(),
      href: FIELDS.href.value.trim() || (slug ? `/projects/${slugify(kind)}/${slug}/` : ""),

      website_url: FIELDS.website.value.trim(),
      github_url:  FIELDS.github.value.trim(),
      docs_url:    FIELDS.docs.value.trim(),
      huggingface_url: FIELDS.hf.value.trim(),
      readme_url:  FIELDS.readme.value.trim(),
      license_url: FIELDS.licurl.value.trim(),
      demo_url:    FIELDS.demo.value.trim(),
      download_url:FIELDS.dl.value.trim(),

      logo: FIELDS.logo.value.trim() || "./logo.png",
      tags: parseCSV(FIELDS.tags.value),

      images: readListLines(FIELDS.images),
      media:  parseMedia(readListLines(FIELDS.media)),

      resources: parseKV(readListLines(FIELDS.resources)),
      downloads: parseKV(readListLines(FIELDS.downloads)),
      versions:  parseVersions(readListLines(FIELDS.versions))
    };
    return m;
  }

  // Default inline templates (simple; mirrors desktop defaults)
  const TPL = {
    index: ({title, blurb, description, slug}) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="robots" content="noindex, nofollow"/>
  <title>${esc(title)} · Software | ZZX-Labs R&D</title>
  <link rel="stylesheet" href="/static/styles.css"/>
  <script src="/static/script.js" defer></script>
  <link rel="stylesheet" href="./style.css"/>
  <script src="./script.js" defer></script>
</head>
<body class="project ${esc(slug)}">
<header><div id="zzx-header"></div></header>
<main>
  <br/><div id="ticker-container"></div><br/>
  <section class="project-hero container">
    <div class="hero-row">
      <img class="project-logo" id="project-logo" alt="${esc(title)} logo"/>
      <div class="hero-copy">
        <h1 id="project-title">${esc(title)}</h1>
        <p id="project-blurb" class="muted">${esc(blurb || "")}</p>
        <div class="cta-row" id="cta-row"></div>
        <div class="badges" id="project-badges"></div>
      </div>
    </div>
  </section>

  <section class="container">
    <div class="grid grid-2">
      <article class="panel">
        <h2>Overview</h2>
        <p id="project-description" class="desc">${esc(description || "")}</p>
        <h3>Meta</h3><ul class="meta-list" id="meta-list"></ul>
        <h3>Tags</h3><ul class="tags" id="tag-list"></ul>
      </article>
      <article class="panel resources">
        <h2>Docs & Links</h2><ul id="link-list" class="link-list"></ul>
        <h3>Versions</h3><ul class="versions" id="version-list"></ul>
      </article>
    </div>
  </section>

  <section class="container">
    <h2>Media</h2>
    <div id="gallery" class="image-grid"></div>
    <p class="muted" id="gallery-hint"></p>
  </section>

  <section class="container backlinks">
    <a class="btn alt" href="/projects/software/">← All Software Projects</a>
    <a class="btn alt" href="/projects/">← Projects</a>
  </section>
</main>
<footer><div id="zzx-footer"></div></footer>
</body>
</html>`,

    style: `:root{--accent:#c0d674;--accent-alt:#e6a42b;--muted:#9aa1aa}
.project-hero .hero-row{display:grid;grid-template-columns:96px 1fr;gap:1rem;align-items:center}
.project-logo{inline-size:96px;block-size:96px;object-fit:contain;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.12)}
.hero-copy h1{margin:0 0 .25rem}
.muted{color:var(--muted)}
.cta-row{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.6rem}
.btn{display:inline-block;background:var(--accent);color:#101218;border:1px solid rgba(255,255,255,.14);padding:.42rem .78rem;border-radius:8px;text-decoration:none;font-weight:700;line-height:1}
.btn:hover{filter:brightness(1.05)}
.btn.ghost{background:rgba(255,255,255,.02);color:#eaeaea;border:1px solid rgba(255,255,255,.2)}
.btn.alt{background:var(--accent-alt);color:#101218}
.badges{display:flex;gap:.4rem;margin-top:.5rem;flex-wrap:wrap}
.badge{display:inline-flex;align-items:center;gap:.35rem;padding:.2rem .55rem;border-radius:999px;font:700 .75rem/1 ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.04);color:#dcdcdc}
.badge .dot{inline-size:.5rem;block-size:.5rem;border-radius:50%;background:var(--accent)}
.panel{margin:1.25rem 0;padding:1rem 1.15rem;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:rgba(255,255,255,.02)}
.panel h2{margin:0 0 .65rem;color:var(--accent)}
.panel h3{margin:0 0 .65rem;color:var(--accent-alt)}
.desc{color:#eaeaea}
.meta-list,.tags,.versions,.link-list{list-style:none;padding:0;margin:.25rem 0 .25rem}
.meta-list li{color:#cfd3da;margin:.25rem 0;line-height:1.35}
.tags li,.versions li{display:inline-flex;align-items:center;gap:.4rem;margin:.25rem .4rem .25rem 0;padding:.2rem .6rem;border-radius:999px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);color:#e8e8e8;font-size:.9rem}
.link-list li{margin:.3rem 0}
.link-list a{color:#e8e8e8;text-decoration:underline}
.link-list a:hover{color:#fff}
.image-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}
.image-grid .image{background:#111;border:1px solid #3e3e3e;border-radius:8px;overflow:hidden}
.image-grid img,.image-grid video{display:block;inline-size:100%;block-size:auto}
@media (max-width:992px){.image-grid{grid-template-columns:repeat(2,1fr)}}
@media (max-width:640px){.image-grid{grid-template-columns:1fr}}
.backlinks{padding-bottom:2rem}`,

    // minimal boot script (reads local manifest.json)
    script: `// Unified Project Page Boot — reads ./manifest.json and renders hero, buttons, links, tags, versions, and media
(function () {
  const $=(s)=>document.querySelector(s);
  const esc=(s)=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const escAttr=(s)=>String(s).replace(/"/g,'&quot;');

  const titleEl=$("#project-title"), blurbEl=$("#project-blurb"), logoEl=$("#project-logo");
  const ctaRow=$("#cta-row"), badgesEl=$("#project-badges"), descEl=$("#project-description");
  const metaList=$("#meta-list"), tagList=$("#tag-list"), verList=$("#version-list"), linkList=$("#link-list");
  const galleryEl=$("#gallery"), galHintEl=$("#gallery-hint");

  const BUTTONS=[["Open","href","solid"],["GitHub","github_url","ghost"],["Docs","docs_url","ghost"],["Website","website_url","ghost"],["Hugging Face","huggingface_url","ghost"],["README","readme_url","ghost"],["LICENSE","license_url","ghost"],["Demo","demo_url","alt"],["Download","download_url","alt"]];

  (async function(){
    try{
      const res=await fetch("./manifest.json",{cache:"no-cache"}); if(!res.ok) throw new Error("HTTP "+res.status);
      const m=await res.json();
      if(m.title) titleEl.textContent=m.title;
      if(m.blurb) blurbEl.textContent=m.blurb;
      const logo=m.logo||(Array.isArray(m.images)&&m.images[0]); if(logo) logoEl.src=logo;

      BUTTONS.forEach(([label,key,style])=>addBtn(label,m[key],style));
      if(Array.isArray(m.downloads)) m.downloads.forEach(d=>addBtn(d.label||"Download", d.url, "alt"));

      addBadge(cap(m.state||"research"));
      const latest=(Array.isArray(m.versions)?m.versions:[])[0];
      if(latest?.version) addBadge("v"+latest.version,false);

      if(m.description) descEl.textContent=m.description;
      const meta=[];
      if(m.slug) meta.push(li("Slug",m.slug));
      if(m.state) meta.push(li("State",m.state));
      if(m.license) meta.push(li("License",m.license));
      if(m.href) meta.push(liLink("URL",m.href));
      metaList.innerHTML = meta.join("") || '<li class="muted">No meta yet.</li>';

      tagList.innerHTML=""; (m.tags||[]).forEach(t=>{const li=document.createElement("li"); li.textContent=t; tagList.appendChild(li);});
      if(!tagList.children.length) tagList.innerHTML='<li class="muted">No tags yet.</li>';

      verList.innerHTML=""; (m.versions||[]).forEach(v=>{const li=document.createElement("li"); li.textContent=v.date? \`\${v.version} — \${v.date}\${v.notes? \` — \${v.notes}\` : ""}\` : v.version; verList.appendChild(li);});
      if(!verList.children.length) verList.innerHTML='<li class="muted">No versions yet.</li>';

      linkList.innerHTML="";
      linkOf("Website",m.website_url); linkOf("Docs",m.docs_url); linkOf("GitHub",m.github_url);
      linkOf("Hugging Face",m.huggingface_url); linkOf("README",m.readme_url); linkOf("LICENSE",m.license_url);
      linkOf("Demo",m.demo_url); linkOf("Open",m.href);
      (m.resources||[]).forEach(r=>linkOf(r.label||"Resource",r.url));

      const media=(Array.isArray(m.images)?m.images.map(src=>({type:"image",src})):[]).concat(Array.isArray(m.media)?m.media:[]);
      if(!media.length) galHintEl.textContent="No screenshots yet — add image paths or media entries in manifest.json.";
      else { galHintEl.textContent=""; media.forEach(addMedia); }

    }catch(e){ console.error(e); galHintEl.textContent="Manifest failed to load."; }
  })();

  function addBtn(text,href,style="solid"){ if(!href) return; const a=document.createElement("a");
    a.className="btn"+(style==="ghost"?" ghost":(style==="alt"?" alt":"")); a.textContent=text; a.href=href;
    if(/^https?:\/\//i.test(href)){ a.target="_blank"; a.rel="noopener noreferrer"; }
    ctaRow.appendChild(a);}
  function addBadge(label,dot=true){ const b=document.createElement("span"); b.className="badge"; b.innerHTML=(dot?'<span class="dot"></span>':'')+esc(label); badgesEl.appendChild(b); }
  function addMedia(item){ const wrap=document.createElement("figure"); wrap.className="image";
    if(item.type==="video"){ const v=document.createElement("video"); v.src=item.src; v.controls=true; v.preload="metadata"; if(item.poster) v.poster=item.poster; wrap.appendChild(v);}
    else if(item.type==="embed"){ const i=document.createElement("iframe"); i.src=item.src; i.loading="lazy"; i.allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"; i.allowFullscreen=true; i.style.width="100%"; i.style.minHeight="260px"; wrap.appendChild(i);}
    else{ const img=document.createElement("img"); img.src=item.src; img.alt=item.alt||"Project media"; img.loading="lazy"; img.decoding="async"; wrap.appendChild(img);}
    galleryEl.appendChild(wrap); }
  function linkOf(label,url){ if(!url) return; const li=document.createElement("li"); const a=document.createElement("a"); a.href=url; a.textContent=label; if(/^https?:\/\//i.test(url)){ a.target="_blank"; a.rel="noopener noreferrer"; } li.appendChild(a); linkList.appendChild(li); }
  function li(label,value){ return '<li><strong>'+esc(label)+':</strong> '+esc(value)+'</li>'; }
  function liLink(label,url){ if(!url) return ""; const safe=escAttr(url); return '<li><strong>'+esc(label)+':</strong> <a href="'+safe+'" target="_blank" rel="noopener noreferrer">'+safe+'</a></li>'; }
  function cap(s){ s=String(s||""); return s.charAt(0).toUpperCase()+s.slice(1); }
})();`
  };

  function wireActions() {
    $("#btn-generate")?.addEventListener("click", () => {
      const m = buildManifestFromForm();
      OUT.manifest.value = JSON.stringify(m, null, 2);

      OUT.index.value  = TPL.index(m);
      OUT.style.value  = TPL.style;
      OUT.script.value = TPL.script;

      OUT.hint.textContent = "Generated — use the download buttons below.";
    });

    // Individual downloads
    document.querySelectorAll("button[data-dl]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const which = btn.getAttribute("data-dl");
        const map = { manifest: ["manifest.json", OUT.manifest.value],
                      index:    ["index.html", OUT.index.value],
                      style:    ["style.css",   OUT.style.value],
                      script:   ["script.js",   OUT.script.value] };
        const pair = map[which];
        if (!pair) return;
        downloadText(pair[0], pair[1] || "");
        flash(btn, "Saved!");
      });
    });

    // Download all (four files) — simple multi-download (no zip dependency)
    $("#btn-download-all")?.addEventListener("click", () => {
      downloadText("manifest.json", OUT.manifest.value || "");
      downloadText("index.html",    OUT.index.value || "");
      downloadText("style.css",     OUT.style.value || "");
      downloadText("script.js",     OUT.script.value || "");
      flash($("#btn-download-all"), "Saved!");
    });
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
  function flash(btn, text) {
    if (!btn) return;
    const old = btn.textContent;
    btn.textContent = text;
    setTimeout(() => btn.textContent = old, 900);
  }
})();

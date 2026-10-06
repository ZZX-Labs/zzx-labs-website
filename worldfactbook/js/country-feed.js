(function () {
  "use strict";
  const W = window.WFB;
  if (!W) return;

  const order = ["edition-frontispiece", "introduction", "national-symbols", "geography", "people-and-society", "environment",
    "government", "economy", "energy", "communications", "transportation",
    "military-and-security", "space", "transnational-issues", "visual-archive", "raw"];
  const names = {"people-and-society":"People & society", "military-and-security":"Military & security",
    "transnational-issues":"Transnational issues", "raw":"Other source material",
    "national-symbols":"Flags, arms & seals", "edition-frontispiece":"Edition cover & front matter",
    "visual-archive":"Visual archive"};
  const labels = {"introduction":"Context and historical background", "geography":"The land and its setting",
    "people-and-society":"A portrait of the population", "government":"Institutions and administration",
    "economy":"Production, trade and finance", "energy":"Power and resources"};
  const el = (tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value != null) node.textContent = String(value);
    return node;
  };
  const safeURL = value => {
    try { const url = new URL(value); return ["https:","http:"].includes(url.protocol) ? url.href : ""; }
    catch (_) { return ""; }
  };
  const localPath = path => typeof path === "string" &&
    /^(?:media|api\/web-archive\/media)\/[a-zA-Z0-9/_-]+\.(?:png|jpe?g|webp|gif)$/i.test(path) &&
    !path.split("/").includes("..");
  const title = category => names[category] || String(category || "Source material")
    .replaceAll("-", " ").replace(/\b\w/g, letter => letter.toUpperCase());
  const sequence = ([key]) => {
    const index = order.indexOf(key);
    return index < 0 ? order.length : index;
  };
  function reference(parent, source, locator, prefix="Source") {
    const line = el("p", "wfb-feed-reference");
    line.append(el("span", "", `${prefix}${locator ? " · " + locator : ""}`));
    const url = safeURL(source);
    if (url) { const a = el("a", "", "View archived source ↗"); a.href = url;
      a.rel = "noopener noreferrer"; a.target = "_blank"; line.append(a); }
    parent.append(line);
  }
  function begin(panel, {name,code,year,status,source,kind}) {
    panel.replaceChildren();
    panel.classList.add("wfb-feed");
    const hero = el("header", "wfb-feed-hero");
    const heading = el("div", "wfb-feed-hero-title");
    heading.append(el("p", "wfb-feed-eyebrow", `THE WORLD FACTBOOK  /  ${kind || "EDITION RECORD"}`));
    heading.append(el("h4", "", name || code));
    heading.append(el("p", "", `Edition ${year} · ${status || "partial"} · ${code}`));
    const yearMark = el("span", "wfb-feed-year", year);
    yearMark.setAttribute("aria-label", `Edition ${year}`);
    hero.append(heading, yearMark);
    panel.append(hero);
    const note = el("p", "wfb-feed-provenance",
      source ? `Source: ${source}. Coverage and attribution follow each record.` :
        "Coverage is based on the available source records for this location and year.");
    panel.append(note);
    return panel;
  }
  function chapter(panel, category, number, count) {
    const section = el("section", "wfb-country-section wfb-feed-chapter");
    const id = `wfb-chapter-${number}`;
    section.id = id;
    section.dataset.category = category;
    const header = el("div", "wfb-feed-chapter-head");
    header.append(el("span", "wfb-feed-chapter-number", String(number).padStart(2,"0")));
    const heading = el("div", "");heading.append(el("p", "wfb-feed-deck", labels[category] || "Edition source records"));
    heading.append(el("h4", "", title(category)));
    header.append(heading, el("span", "wfb-feed-count", `${count} ${count === 1 ? "entry" : "entries"}`));
    section.append(header);panel.append(section);
    return section;
  }
  function contents(panel, groups) {
    if (!groups.length) return;
    const nav = el("nav", "wfb-feed-contents");nav.setAttribute("aria-label", "Profile chapters");
    nav.append(el("span", "wfb-feed-contents-title", "IN THIS EDITION"));
    for (let i=0;i<groups.length;i++) {
      const a = el("a", "", `${String(i+1).padStart(2,"0")}  ${title(groups[i][0])}`);
      a.href = `#wfb-chapter-${i+1}`;nav.append(a);
    }
    panel.append(nav);
  }
  function value(parent, content) {
    const segments = String(content || "").trim().split(/\n\s*\n/);
    for (const segment of segments) {
      const lines = segment.split(/\n/).filter(line => line.trim());
      if (!lines.length) continue;
      if (lines.length > 1 && lines.every(line => /^\s*(?:[•*]|[-–]\s|\d+[.)]\s)/.test(line))) {
        const list = el("ul", "wfb-feed-list");
        for (const line of lines) list.append(el("li", "", line.replace(/^\s*(?:[•*]|[-–]|\d+[.)])\s*/, "")));
        parent.append(list);
      } else parent.append(el("p", "wfb-feed-value", segment));
    }
  }
  const symbolKinds = new Set(["flag","coat-of-arms","crest","seal"]);
  function mediaFigure(item, root, edition=false) {
    const kind=String(item.kind || "image").toLowerCase();
    const figure=el("figure", `wfb-feed-figure ${edition ? "wfb-feed-edition-image" : ""} wfb-visual-${kind.replace(/[^a-z-]/g,"")}`);
    const rights=String(item.rights || "").trim().toLowerCase();
    if (["public domain","public-domain","redistribution cleared"].includes(rights) && localPath(item.path)) {
      const img=el("img"), local = new URL(item.path,root).href;
      window.ZZXWorldFactbook.archiveAssetURL(item.path).then(url => {
        img.onerror = () => { img.onerror = null; if (img.src !== local) img.src = local; };
        img.src = url;
      }).catch(() => { img.src = local; });
      img.loading="lazy";img.decoding="async";img.alt=item.alt || item.label || item.caption || "Archival image";
      figure.append(img);
    } else figure.append(el("p", "wfb-media-withheld", "Image awaiting source and rights review"));
    const caption=el("figcaption", "");
    caption.append(el("strong", "", item.label || item.caption || item.kind || "Archive image"));
    caption.append(el("span", "", `${item.kind || "Image"} · ${edition ? `Edition ${item.edition_year || "?"} · ` : ""}${item.locator || item.date || "source location unavailable"}`));
    caption.append(el("span", "", `Credit: ${item.credit || "not recovered"} · ${item.rights_holder ? `Rights holder: ${item.rights_holder} · ` : ""}${item.rights || "rights review pending"}`));
    if (edition && item.original_filename) caption.append(el("span", "", `Original: ${item.original_filename}`));
    reference(caption,item.source_url || item.snapshot_url,item.citation_key || "", "Image source");
    figure.append(caption);
    if(item.ocr){const details=el("details"),summary=el("summary", "", "Read extracted image text");
      details.append(summary,el("p", "wfb-feed-value",item.ocr));figure.append(details);}
    return figure;
  }
  function fields(panel, allFields, source, editionImages=[], root="") {
    const groups = new Map();
    for (const field of allFields || []) {
      const category = String(field.category || "raw").toLowerCase();
      if (!groups.has(category)) groups.set(category,[]);
      groups.get(category).push(field);
    }
    const visuals=new Map();
    for (const item of editionImages || []) {
      const category = symbolKinds.has(String(item.kind || "").toLowerCase()) ? "national-symbols" :
        String(item.kind || "").toLowerCase()==="cover" ? "edition-frontispiece" :
        groups.has(String(item.category || "").toLowerCase()) ? String(item.category).toLowerCase() : "visual-archive";
      if (!visuals.has(category)) visuals.set(category,[]);
      visuals.get(category).push(item);
      if (!groups.has(category)) groups.set(category,[]);
    }
    const entries = [...groups.entries()].sort((a,b) => sequence(a)-sequence(b) || a[0].localeCompare(b[0]));
    contents(panel,entries);
    for (let i=0;i<entries.length;i++) {
      const [category,items] = entries[i], section = chapter(panel,category,i+1,items.length+(visuals.get(category)?.length||0));
      let list = el("dl", "wfb-feed-fields");
      const bySlot=Array.from({length:items.length+1},()=>[]);
      for(const visual of visuals.get(category)||[]) {
        const imageLocator=String(visual.locator||"");
        let slot=items.length;
        const chapter=imageLocator.split("#line:")[0];
        const line=Number(imageLocator.split("#line:")[1]);
        if (Number.isFinite(line) && imageLocator.includes("#line:")) {
          const match=items.findIndex(item=>String(item.locator||"").split("#line:")[0]===chapter &&
            Number(String(item.locator).split("#line:")[1])>=line);
          if(match>=0)slot=match;
        }
        bySlot[slot].push(visual);
      }
      function place(slot) {
        for (const visual of bySlot[slot]) {
          const wrapper=el("div","wfb-feed-visual-inset");
          wrapper.append(mediaFigure(visual,root,true));section.append(wrapper);
        }
      }
      // Put a visual in the corresponding chapter, before the first field
      // following its XHTML line when that position is known.
      place(0);
      for (let j=0;j<items.length;j++) {
        const item=items[j];
        const row = el("div", "wfb-country-field wfb-feed-field");
        row.append(el("dt", "", item.label || "Unlabeled source field"));
        const body=el("dd", "");value(body,item.content);
        reference(body,item.source_url || source,item.locator || "", "Page / section");
        row.append(body);list.append(row);
        if(bySlot[j+1].length) {section.append(list);place(j+1);list=el("dl", "wfb-feed-fields");}
      }
      if(list.childNodes.length && list.parentNode!==section)section.append(list);
    }
    return entries.length;
  }
  function legacy(panel, grouped) {
    const entries = [...grouped.entries()].sort((a,b) => sequence(a)-sequence(b) || a[0].localeCompare(b[0]));
    contents(panel,entries);
    for (let i=0;i<entries.length;i++) {
      const [category,items] = entries[i],section=chapter(panel,category,i+1,items.length);
      for (const chunk of items) {
        const article=el("article", "wfb-feed-excerpt");
        article.append(el("p", "wfb-feed-excerpt-label", `ARCHIVED TRANSCRIPTION  ·  ${chunk.ordinal ?? "?"}`));
        value(article,chunk.content);
        reference(article,chunk.source_url,chunk.source_identifier || "", "Unreviewed source");
        section.append(article);
      }
    }
    return entries.length;
  }
  function media(panel, rows, root, heading="Images, maps & diagrams") {
    if (!rows?.length) return 0;
    const section=el("section", "wfb-country-section wfb-feed-gallery");
    section.append(el("p", "wfb-feed-deck", "Visual records"),el("h4", "", heading));
    const grid=el("div", "wfb-country-media");
    for (const item of rows) {
      grid.append(mediaFigure(item,root));
    }
    section.append(grid);panel.append(section);return rows.length;
  }
  function web(panel, records, root, code, name, year) {
    const relevant=(records || []).filter(row => Number(row.capture_year)===Number(year) &&
      row.country_code===code && ["country","image","image-ocr"].includes(row.type));
    if (!relevant.length) return 0;
    const section=el("section", "wfb-country-section wfb-feed-web");
    section.append(el("p", "wfb-feed-deck", `Web captures · ${year}`),el("h4", "", "From the archived site"));
    section.append(el("p", "wfb-country-notice",
      "A capture date is not an edition date. These web records remain unreviewed until checked against the archived page."));
    const combined=new Map();
    for(const row of relevant){
      const key=[row.timestamp,row.source_url,row.type,row.asset?.sha256||row.asset?.source_url||""].join("|");
      if(!combined.has(key))combined.set(key,{...row,text:"",fields:[]});
      const target=combined.get(key);target.text+=row.text||"";
      for(const field of row.fields||[]){
        const previous=target.fields[target.fields.length-1];
        if(previous && previous.label===field.label && previous.locator===field.locator)
          previous.content+=field.content||"";
        else target.fields.push({...field});
      }
    }
    for (const row of combined.values()) {
      const article=el("article", "wfb-feed-feature");
      article.append(el("h5", "", row.title || title(row.type)));
      if(row.text)value(article,row.text);
      if(row.fields?.length){
        const list=el("dl", "wfb-feed-fields");
        for(const field of row.fields){
          const entry=el("div", "wfb-country-field wfb-feed-field");
          entry.append(el("dt", "", field.label || "Source field"));
          const body=el("dd", "");value(body,field.content);entry.append(body);list.append(entry);
        }
        article.append(list);
      }
      if(row.asset)media(article,[row.asset],root,"Captured image");
      reference(article,row.snapshot_url,row.date || "", "Captured");section.append(article);
    }
    panel.append(section);return combined.size;
  }
  function leaders(panel, terms, year) {
    if (!terms?.length) return 0;
    const pending=terms.some(row=>row.month&&row.source_name&&!(Number(row.parser_version)>=2));
    terms=terms.filter(row=>!row.month||!row.source_name||Number(row.parser_version)>=2);
    if(pending&&!terms.length){panel.append(el("p","wfb-country-notice","Monthly leadership source assignments await verification."));return 0;}
    const section=el("section","wfb-country-section wfb-feed-leaders");
    section.append(el("p","wfb-feed-deck",`Supplemental leadership register · ${year}`),
      el("h4","","Heads of state & public offices"),
      el("p","wfb-country-notice","Monthly directory snapshots show who was listed at that date. A snapshot does not establish when an office term began or ended."));
    const months=[...new Set(terms.map(row=>row.month).filter(Boolean))].sort();
    let picker=null;
    if(months.length){
      const label=el("label","wfb-leader-month","Directory month ");
      picker=el("select");picker.setAttribute("aria-label","Select monthly leadership directory");
      for(const month of months){const option=el("option","",month);option.value=month;picker.append(option);}
      picker.value=months[months.length-1];label.append(picker);section.append(label);
    }
    const list=el("dl","wfb-feed-fields");
    function render(){
      list.replaceChildren();
      for(const item of terms.filter(row=>!picker||row.month===picker.value)){
        const row=el("div","wfb-country-field wfb-feed-field");
        row.append(el("dt","",item.position));
        const body=el("dd","");body.append(el("strong","",item.person));
        const span=item.month?`listed ${item.month}${item.as_of?` · information as of ${item.as_of}`:""}`:
          item.start||item.end?`${item.start||"start unknown"} – ${item.end||"end unverified"}`:"term dates unknown";
        body.append(el("p","wfb-feed-reference",`${span} · ${item.coverage||"source record"}`));
        reference(body,item.statement_url||item.source_url,item.source_page?`page ${item.source_page}`:"",
          item.source_name||"Leadership source");
        row.append(body);list.append(row);
      }
    }
    picker?.addEventListener("change",render);render();
    section.append(list);panel.append(section);return terms.length;
  }
  W.CountryFeed=Object.freeze({begin,fields,legacy,media,web,leaders,localPath});
})();

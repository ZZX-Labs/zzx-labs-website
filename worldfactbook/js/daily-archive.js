(function () {
  "use strict";
  const W = window.WFB;
  if (!W) return;
  const $ = selector => W.$(selector);
  const create = (tag, className, value) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value !== undefined) element.textContent = String(value);
    return element;
  };
  let index = null, selected = "", generation = 0;
  let images = [], flags = [], leaders = [];
  const months = new Map(), featureIndexes = new Map(), featureYears = new Map();
  let places = null;
  const days = () => Array.isArray(index?.days) ? index.days.map(item => item.date).sort() : [];

  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
    const day = new Date(value + "T00:00:00Z");
    return !Number.isNaN(day.valueOf()) && day.toISOString().slice(0, 10) === value;
  }
  function label(value) {
    if (!validDate(value)) return "Date unavailable";
    return new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
      .format(new Date(value + "T00:00:00Z"));
  }
  function badge(name, value, ready) {
    const element = $(`[data-wfb-${name==="flags"?"flag":name}-status]`) || $(`[data-wfb-${name}-status]`);
    if (!element) return;
    element.textContent = value;
    element.classList.toggle("is-ready", !!ready);
  }
  function link(url, text) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") return null;
      const anchor = create("a", "wfb-desk-link", text);
      anchor.href = parsed.href;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      return anchor;
    } catch (_) { return null; }
  }
  function empty(target, marker, message, more) {
    target.replaceChildren();
    const box = create("div", "wfb-desk-empty");
    box.append(create("span", "wfb-desk-empty-mark", marker));
    box.append(create("p", "", message));
    if (more) box.append(create("small", "", more));
    target.append(box);
  }
  function cite(row, target, byline) {
    const meta = create("div", "wfb-desk-citation");
    meta.append(create("span", "", byline));
    if(row.source_name)meta.append(create("small","",`${row.source_name}${row.source_page?" · page "+row.source_page:""}${row.source_sha256?" · SHA-256 "+row.source_sha256:""}`));
    const evidence = Array.isArray(row.evidence) ? row.evidence[0] : null;
    const source = link(evidence?.snapshot_url || row.snapshot_url || row.source_url,
      "View captured source ↗");
    if (source) meta.append(source);
    target.append(meta);
  }
  async function month(date) {
    const key = date.slice(0, 7);
    if (!index?.months?.includes(`months/${key}.json`)) return [];
    if (!months.has(key)) {
      months.set(key, W.api.probe(`daily-archive/months/${key}.json`)
        .then(payload => Array.isArray(payload?.records) ? payload.records : [])
        .catch(() => []));
    }
    return months.get(key);
  }
  async function fact(token) {
    const target = $("[data-wfb-fact-readout]");
    if (!target) return;
    const rows = (await month(selected)).filter(row => row.date === selected);
    if (token !== generation) return;
    if (!rows.length) {
      badge("fact", "No dated record", false);
      empty(target, "—", `No Fact of the Day has been recovered for ${label(selected)}.`,
        "This means no source record is indexed, not that no fact was published.");
      return;
    }
    const row = rows[0];
    badge("fact", rows.length === 1 ? "Source recovered" : `${rows.length} source versions`, true);
    target.replaceChildren();
    target.append(create("span", "wfb-desk-date", label(selected)));
    target.append(create("h4", "wfb-desk-title", row.title));
    target.append(create("p", "wfb-desk-body", row.body));
    if (rows.length > 1) target.append(create("p", "wfb-desk-alert",
      "Different captured versions exist for this date. The archive keeps each version for review."));
    cite(row, target, "CIA World Factbook · dated historical edition");
  }
  function localAsset(asset) {
    const path = String(asset?.path || "");
    if (!/^media\/[A-Za-z0-9/_-]+\.(?:png|jpe?g|webp|svg)$/i.test(path) || path.includes("..")) return null;
    if (!/^(public domain|public-domain|redistribution cleared)$/i.test(String(asset.rights || ""))) return null;
    return new URL(path, window.ZZXWorldFactbook.root).href;
  }
  async function installAsset(img, asset) {
    const local=localAsset(asset);if(!local)return false;
    const path=String(asset.path);
    try {
      img.onerror=()=>{img.onerror=null;if(img.src!==local)img.src=local;};
      img.src=await window.ZZXWorldFactbook.archiveAssetURL(path);
    }catch(error){img.src=local;}
    return true;
  }
  async function featureYear(kind,date) {
    const catalog=featureIndexes.get(kind),year=date.slice(0,4),pointer=catalog?.years?.[year];
    if(!pointer){
      if(kind!=="leaders")return [];
      const documents=await W.api.probe("verified-html/index.json");
      // Older installed monthly archives lack a global year pointer; read one deterministic country shard.
      const codes=Object.keys(documents?.countries||{}).filter(code=>!code.startsWith("X-")).sort();
      if(!codes.length)return [];
      const code=codes[Number(date.replaceAll("-",""))%codes.length];
      const manifest=await W.api.probe(`leaders/countries/${code}/${year}/index.json`);
      const parts=await Promise.all((manifest?.parts||[]).map(part=>W.api.probe(String(part.path||part).replace(/^api\//,""))));
      return parts.flatMap(part=>part?.terms||[]).map(row=>({...row,office:row.position}));
    }
    const key=kind+"/"+year;
    if(!featureYears.has(key))featureYears.set(key,(async()=>{
      const manifest=await W.api.probe(pointer.path||pointer);
      const parts=await Promise.all((manifest?.parts||[]).map(part=>
        W.api.probe(String(part.path||part).replace(/^api\//,""))));
      return [...(manifest?.records||manifest?.images||[]),...parts.flatMap(part=>part?.records||part?.images||[])];
    })().catch(error=>{featureYears.delete(key);throw error;}));
    return featureYears.get(key);
  }
  function snapshotLeader(row,date) {
    const source=row.source_url||row.snapshot_url||(row.source_name&&/^[a-f0-9]{64}$/i.test(row.source_sha256||""));
    return !!(row.person&&(row.office||row.position)&&row.country&&source&&
      (!row.source_name||Number(row.parser_version)>=2)&&
      (String(row.month||"")===date.slice(0,7)||validDate(row.date)&&row.date===date));
  }
  function datedImage(token) {
    if (token !== generation) return;
    const target = $("[data-wfb-image-readout]");
    if (!target) return;
    const row = images.find(item => item.date === selected &&
      ["explicit CIA page label", "published"].includes(item.date_basis));
    if (!row) {
      badge("image", "No verified daily image", false);
      empty(target, "—", "The separate Image of the Day feature is not dated and indexed here yet.",
        "Photos illustrating Fact of the Day remain attached to their facts and are not relabeled as Image of the Day.");
      return;
    }
    badge("image", "Dated capture", true);
    target.replaceChildren();
    const src = localAsset(row.asset);
    if (src) {
      const figure = create("figure", "wfb-desk-figure");
      const photo = create("img", "", undefined);
      installAsset(photo,row.asset);
      photo.alt = row.asset.alt || row.caption || "Archived Image of the Day";
      photo.loading = "lazy";
      photo.decoding = "async";
      figure.append(photo, create("figcaption", "", row.asset.credit || "Credit not recovered"));
      target.append(figure);
    } else {
      target.append(create("div", "wfb-desk-art-wait", "Original image held for credit and rights review"));
    }
    target.append(create("h4", "wfb-desk-title", row.title || "Image of the Day"));
    target.append(create("p", "wfb-desk-body", row.caption || "Caption unavailable in the dated source."));
    cite(row, target, `Published ${label(selected)}`);
  }
  function inTerm(row, date) {
    const start = row.term_start || row.valid_from || row.start;
    const end = row.term_end || row.valid_to || row.as_of_date || row.end;
    return !!(row.person && row.office && row.country && row.source_url &&
      validDate(start) && validDate(end) && start <= date && date <= end);
  }
  function feature(kind, token) {
    if (token !== generation) return;
    const target = $(`[data-wfb-${kind==="flags"?"flag":kind}-readout]`) || $(`[data-wfb-${kind}-readout]`);
    if (!target) return;
    const source = kind === "leaders" ? leaders : flags;
    const eligible = source.filter(row => kind === "leaders" ? inTerm(row, selected)||snapshotLeader(row,selected) :
      !!(row.country && row.source_url && validDate(row.valid_from) &&
         validDate(row.valid_to || row.as_of_date) && row.valid_from <= selected &&
         selected <= (row.valid_to || row.as_of_date)) ||
      kind === "flags" && row.country && Number(row.edition_year)===Number(selected.slice(0,4)) && localAsset(row.asset));
    if (!eligible.length) {
      badge(kind, "Dated index open", false);
      empty(target, "—",
        kind === "leaders" ?
          "No source-cited officeholder term covers this selected date yet." :
          "No source-cited flag with a verified validity period covers this date yet.",
        "The collection will appear here as records with dates, source citations, and image rights are reviewed.");
      return;
    }
    eligible.sort((a, b) => String(a.country).localeCompare(String(b.country)));
    const row = eligible[Number(selected.replaceAll("-", "")) % eligible.length];
    badge(kind, `${eligible.length} cited ${kind === "leaders" ? "officeholders" : "flags"}`, true);
    target.replaceChildren();
    target.append(create("span", "wfb-desk-date", `ZZX daily selection · ${label(selected)}`));
    if (kind === "leaders") {
      target.append(create("h4", "wfb-desk-title", row.person));
      target.append(create("p", "wfb-desk-body", `${row.office||row.position} · ${row.country}`));
      target.append(create("small", "wfb-desk-term", inTerm(row,selected)?`${row.term_start||row.valid_from||row.start} – ${row.term_end||row.end||row.valid_to||row.as_of_date}`:`Source observation ${row.month||row.date}${row.as_of?" · as of "+row.as_of:""}; term dates not inferred`));
    } else {
      const src = localAsset(row.asset);
      if (src) {
        const figure = create("figure", "wfb-desk-flag");
        const img = create("img"); installAsset(img,row.asset);
        img.alt = row.asset.alt || `Flag of ${row.country}`; img.loading = "lazy";
        figure.append(img); target.append(figure);
      }
      target.append(create("h4", "wfb-desk-title", row.country));
      target.append(create("p", "wfb-desk-body", row.description || `Flag shown in edition ${row.edition_year||"source archive"}; a validity period is established only when explicitly cited.`));
    }
    cite(row, target, "Cited archive record · independent ZZX daily selection");
  }
  async function place(token) {
    const target=$("[data-wfb-place-readout]");if(!target)return;
    const date=selected;
    if(!places)places=await W.api.probe("verified-html/index.json");
    if(token!==generation)return;
    const candidates=Object.entries(places?.countries||{}).flatMap(([code,rows])=>{
      const record=rows.filter(row=>row.year<=Number(date.slice(0,4)))
        .sort((a,b)=>b.year-a.year)[0];return record?[{code,...record}]:[];
    }).filter(row=>!row.code.startsWith("X-")&&row.fields>0).sort((a,b)=>a.code.localeCompare(b.code));
    if(!candidates.length){badge("place","No sourced place",false);empty(target,"—","No source profile is installed for this date.");return;}
    const row=candidates[Number(date.replaceAll("-",""))%candidates.length];
    let record;
    try{record=await W.api.probe(String(row.path).replace(/^api\//,""));}catch(error){record=null;}
    if(token!==generation)return;
    if(!record){badge("place","Source unavailable",false);empty(target,"—","The indexed place profile could not be read.");return;}
    target.replaceChildren();badge("place",`Edition ${row.year}`,true);
    target.append(create("h4","wfb-desk-title",row.name),create("p","wfb-desk-body",
      record.fields?.find(field=>field.label==="Background")?.content||"Source profile available in the globe reader."));
    target.append(create("small","",`Independent daily selection from the ${row.year} archive; source text retains its original year.`));
    const open=create("button","","Read location profile");open.type="button";
    open.addEventListener("click",()=>{W.globe.setYear(row.year);W.globe.choose(row.code);$("[data-wfb-country-profile]")?.scrollIntoView({block:"start"});});
    target.append(open);cite(record,target,record.source?.name||"World Factbook source edition");
  }
  async function render() {
    const token = ++generation;
    const field = $("[data-wfb-daily-date]");
    if (field) field.value = selected;
    const coverage = index?.coverage;
    const summary = $("[data-wfb-daily-summary]");
    if (summary) summary.textContent = coverage ?
      `${coverage.observed_days} dated CIA facts recovered · ${label(coverage.first_observed_date)} – ${label(coverage.latest_observed_date)} observed · ` +
      `${index.gaps ?? "unreviewed"} dates still open between observations · ` +
      (coverage.complete_historical_run ? "Full historical run reviewed" : "Full historical run not yet established") :
      "No source-backed daily index is installed. Choose a date after importing archive evidence.";
    const year=selected;
    const payloads=await Promise.allSettled([featureYear("images-of-the-day",year),featureYear("leaders",year),featureYear("flags",year)]);
    if(token!==generation)return;
    const oldRows=kind=>featureIndexes.get(kind)?.records||featureIndexes.get(kind)?.images||[];
    images=[...oldRows("images-of-the-day"),...(payloads[0].status==="fulfilled"?payloads[0].value:[])];
    leaders=[...oldRows("leaders"),...(payloads[1].status==="fulfilled"?payloads[1].value:[])];
    flags=[...oldRows("flags"),...(payloads[2].status==="fulfilled"?payloads[2].value:[])];
    await fact(token);
    datedImage(token);
    feature("leaders", token);
    feature("flags", token);
    await place(token);
  }
  async function setDate(day) {
    if (!validDate(day)) return;
    selected = day;
    await render();
  }
  function move(direction) {
    const indexed = days();
    if (!indexed.length) return;
    const candidate = direction < 0 ? indexed.filter(day => day < selected).at(-1) :
      indexed.find(day => day > selected);
    if (candidate) setDate(candidate);
  }
  async function init() {
    const payloads = await Promise.allSettled([
      W.api.probe("daily-archive/index.json"), W.api.probe("images-of-the-day/index.json"),
      W.api.probe("leaders/index.json"), W.api.probe("flags/index.json")
    ]);
    const [daily,pictureIndex,leaderIndex,flagIndex]=payloads.map(result=>result.status==="fulfilled"?result.value:null);
    featureIndexes.set("images-of-the-day",pictureIndex);featureIndexes.set("leaders",leaderIndex);featureIndexes.set("flags",flagIndex);
    index = daily;
    images = Array.isArray(pictureIndex?.records) ? pictureIndex.records :
      (Array.isArray(pictureIndex?.images) ? pictureIndex.images : []);
    leaders = Array.isArray(leaderIndex?.records) ? leaderIndex.records : [];
    flags = Array.isArray(flagIndex?.records) ? flagIndex.records : [];
    const indexed = days();
    selected = indexed.at(-1) || new Date().toISOString().slice(0,10);
    const input = $("[data-wfb-daily-date]");
    if (input) {
      input.min = "1962-01-01"; input.max = new Date().toISOString().slice(0,10);
      input.addEventListener("change", () => setDate(input.value));
    }
    $("[data-wfb-daily-prev]")?.addEventListener("click", () => move(-1));
    $("[data-wfb-daily-next]")?.addEventListener("click", () => move(1));
    $("[data-wfb-daily-first]")?.addEventListener("click", () => setDate(indexed[0]));
    $("[data-wfb-daily-latest]")?.addEventListener("click", () => setDate(indexed.at(-1)));
    await render();
  }
  async function refresh(){
    const payloads=await Promise.allSettled([W.api.probe("daily-archive/index.json"),W.api.probe("images-of-the-day/index.json"),
      W.api.probe("leaders/index.json"),W.api.probe("flags/index.json")]);
    const kinds=["daily-archive","images-of-the-day","leaders","flags"];
    for(let i=0;i<payloads.length;i++)if(payloads[i].status==="fulfilled"){
      if(i===0)index=payloads[i].value;else featureIndexes.set(kinds[i],payloads[i].value);
    }
    months.clear();featureYears.clear();places=null;await render();
  }
  W.dailyArchive = Object.freeze({ init, setDate, refresh });
})();

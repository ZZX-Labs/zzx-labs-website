// __partials/widgets/btc-news/widget.js
(function () {
  "use strict";

  const W = window;
  const D = document;
  const ID = "btc-news";
  const SOURCE_KEY = "zzx.widget.btc-news.source";

  function q(root,selector){ return root ? root.querySelector(selector) : null; }

  function status(root,label,state) {
    const el=q(root,"[data-news-status]");
    if (!el) return;
    el.textContent=label;
    el.setAttribute("data-status",state || "offline");
  }

  function safeGet() {
    try { return W.localStorage.getItem(SOURCE_KEY); }
    catch (_) { return null; }
  }

  function safeSet(value) {
    try { W.localStorage.setItem(SOURCE_KEY,value); }
    catch (_) {}
  }

  function ago(ts) {
    const n=Number(ts);
    if (!Number.isFinite(n) || n<=0) return "—";

    const sec=Math.max(0,Math.floor((Date.now()-n)/1000));
    if (sec<60) return `${sec}s ago`;

    const min=Math.floor(sec/60);
    if (min<60) return `${min}m ago`;

    const hr=Math.floor(min/60);
    if (hr<24) return `${hr}h ago`;

    return `${Math.floor(hr/24)}d ago`;
  }

  async function ensureSources(core) {
    if (W.ZZXBTCNewsSources?.load) return;

    const base=core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/btc-news";

    const src=W.ZZXAPI?.url
      ? W.ZZXAPI.url(`${base}/js/sources.js`)
      : `${base}/js/sources.js`;

    await new Promise((resolve,reject)=>{
      const s=D.createElement("script");
      s.src=src;
      s.defer=true;
      s.addEventListener("load",resolve,{once:true});
      s.addEventListener("error",reject,{once:true});
      (D.head||D.documentElement).appendChild(s);
    });

    if (!W.ZZXBTCNewsSources?.load) throw new Error("news source module unavailable");
  }

  function sourceFor(state) {
    const list=W.ZZXBTCNewsSources.SOURCES;
    return list[state.index % list.length];
  }

  function renderTicker(root,state) {
    const track=q(root,"[data-news-track]");
    if (!track) return;

    track.replaceChildren();

    const items=state.items.slice(0,9);

    if (!items.length) {
      const span=D.createElement("span");
      span.textContent="no bitcoin-only headlines";
      track.appendChild(span);
      return;
    }

    for (const item of items) {
      const wrap=D.createElement("span");
      wrap.className="btc-news__ticker-item";

      const bullet=D.createElement("span");
      bullet.className="btc-news__ticker-bullet";
      bullet.textContent="•";

      const link=D.createElement("a");
      link.href=item.url;
      link.target="_blank";
      link.rel="noopener noreferrer";
      link.textContent=item.title;

      wrap.append(bullet,link);
      track.appendChild(wrap);
    }

    track.style.animation="none";
    void track.offsetWidth;
    track.style.animation="";
  }

  function renderList(root,state) {
    const list=q(root,"[data-news-list]");
    if (!list) return;

    list.replaceChildren();

    const rows=state.items.slice(0,6);

    if (!rows.length) {
      const empty=D.createElement("div");
      empty.className="btc-news__empty";
      empty.textContent="No Bitcoin headlines available for this source.";
      list.appendChild(empty);
      return;
    }

    for (const item of rows) {
      const row=D.createElement("article");
      row.className="btc-news__item";

      const main=D.createElement("div");
      main.className="btc-news__item-main";

      const link=D.createElement("a");
      link.href=item.url;
      link.target="_blank";
      link.rel="noopener noreferrer";
      link.textContent=item.title;

      const detail=D.createElement("small");
      detail.textContent=`${item.source} · ${item.detail || "headline"}`;

      main.append(link,detail);

      const time=D.createElement("time");
      time.dateTime=item.ts ? new Date(item.ts).toISOString() : "";
      time.textContent=ago(item.ts);

      row.append(main,time);
      list.appendChild(row);
    }
  }

  function render(root,state) {
    const source=sourceFor(state);

    q(root,"[data-news-source]").textContent=source.label;
    q(root,"[data-news-sub]").textContent=
      `${state.items.length} bitcoin-only headline${state.items.length===1?"":"s"} · ${state.route || "not loaded"}`;

    q(root,"[data-news-count]").textContent=
      `${state.items.length} filtered item${state.items.length===1?"":"s"}`;

    q(root,"[data-news-age]").textContent=
      state.updatedAt ? `updated ${ago(state.updatedAt)}` : "—";

    q(root,"[data-news-meta]").textContent=
      `${source.label} · ${state.route || "direct first"} · source rotates every 45 seconds`;

    renderTicker(root,state);
    renderList(root,state);
  }

  async function loadCurrent(root,state,force=false) {
    if (state.busy || !root.isConnected) return;

    state.busy=true;
    status(root,"loading","warn");

    try {
      const source=sourceFor(state);
      const result=await W.ZZXBTCNewsSources.load(source,force);

      state.items=(result.items || []).sort((a,b)=>(b.ts || 0)-(a.ts || 0));
      state.route=result.route || "direct";
      state.updatedAt=Date.now();

      render(root,state);
      status(root,"live","ok");
    } catch (error) {
      state.items=[];
      state.route="error";
      render(root,state);
      status(root,"error","error");
      q(root,"[data-news-meta]").textContent=String(error?.message || error);
    } finally {
      state.busy=false;
    }
  }

  function setIndex(root,state,index,force=false) {
    const sources=W.ZZXBTCNewsSources.SOURCES;
    state.index=((index % sources.length)+sources.length)%sources.length;

    const select=q(root,"[data-news-select]");
    if (select) select.value=sources[state.index].id;

    safeSet(sources[state.index].id);
    loadCurrent(root,state,force);
  }

  async function boot(root,core) {
    if (!root) return;

    const state={
      index:0,
      items:[],
      route:"",
      updatedAt:0,
      busy:false,
      rotateTimer:null,
      ageTimer:null
    };

    root.__zzxBTCNewsState=state;

    try {
      await ensureSources(core || W.ZZXWidgetsCore || null);

      const select=q(root,"[data-news-select]");
      select.replaceChildren();

      for (const source of W.ZZXBTCNewsSources.SOURCES) {
        const option=D.createElement("option");
        option.value=source.id;
        option.textContent=source.label;
        select.appendChild(option);
      }

      const saved=safeGet();
      const found=W.ZZXBTCNewsSources.SOURCES.findIndex(s=>s.id===saved);
      state.index=found>=0 ? found : 0;
      select.value=sourceFor(state).id;

      select.addEventListener("change",()=>{
        const idx=W.ZZXBTCNewsSources.SOURCES.findIndex(s=>s.id===select.value);
        setIndex(root,state,idx,false);
      });

      q(root,"[data-news-next]")?.addEventListener("click",()=>{
        setIndex(root,state,state.index+1,false);
      });

      q(root,"[data-news-refresh]")?.addEventListener("click",()=>{
        loadCurrent(root,state,true);
      });

      await loadCurrent(root,state,false);

      function rotateLoop() {
        if (!root.isConnected) return;
        setIndex(root,state,state.index+1,false);
        state.rotateTimer=W.setTimeout(rotateLoop,45000);
      }

      function ageLoop() {
        if (!root.isConnected) return;
        q(root,"[data-news-age]").textContent=
          state.updatedAt ? `updated ${ago(state.updatedAt)}` : "—";
        state.ageTimer=W.setTimeout(ageLoop,10000);
      }

      state.rotateTimer=W.setTimeout(rotateLoop,45000);
      state.ageTimer=W.setTimeout(ageLoop,10000);
    } catch (error) {
      status(root,"offline","error");
      q(root,"[data-news-meta]").textContent=String(error?.message || error);
    }
  }

  if (W.ZZXAPI?.register) W.ZZXAPI.register(ID,boot);
  else if (W.ZZXWidgetsCore?.onMount) W.ZZXWidgetsCore.onMount(ID,boot);
  else if (W.ZZXWidgets?.register) W.ZZXWidgets.register(ID,boot);
})();

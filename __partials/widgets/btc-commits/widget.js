(function(){
  "use strict";
  const W=window,D=document,ID="btc-commits",REFRESH_MS=60000;
  const q=(r,s)=>r?r.querySelector(s):null;
  const set=(r,s,v)=>{const e=q(r,s);if(e)e.textContent=v==null?"—":String(v)};
  function status(r,l,s){const e=q(r,"[data-commits-status]");if(e){e.textContent=l;e.setAttribute("data-status",s||"offline")}}
  function resolve(p){return W.ZZXAPI?.url?W.ZZXAPI.url(p):p}
  async function ensure(core){
    const base=core?.widgetBase?String(core.widgetBase(ID)).replace(/\/+$/g,""):"/__partials/widgets/btc-commits";
    for(const [name,rel] of [["ZZXBTCCommitsSources","js/sources.js"],["ZZXBTCCommitsFetch","js/fetch.js"],["ZZXBTCCommitsModel","js/model.js"]]){
      if(W[name])continue;
      await new Promise((ok,bad)=>{const s=D.createElement("script");s.src=resolve(`${base}/${rel}`);s.defer=true;s.addEventListener("load",ok,{once:true});s.addEventListener("error",()=>bad(new Error(`failed to load ${rel}`)),{once:true});(D.head||D.documentElement).appendChild(s)});
      if(!W[name])throw new Error(`${rel} did not initialize ${name}`);
    }
  }
  function ago(date){
    const t=new Date(date).getTime();if(!Number.isFinite(t))return "time unknown";
    const sec=Math.max(0,Math.floor((Date.now()-t)/1000));if(sec<60)return `${sec}s ago`;
    const min=Math.floor(sec/60);if(min<60)return `${min}m ago`;const hr=Math.floor(min/60);if(hr<24)return `${hr}h ago`;return `${Math.floor(hr/24)}d ago`;
  }
  function renderList(root,rows){
    const host=q(root,"[data-commits-list]");if(!host)return;host.replaceChildren();
    for(const row of rows.slice(0,8)){
      const item=D.createElement("div");item.className="btc-commits__row";
      const sha=D.createElement("code");sha.textContent=row.shortSha||"—";
      const main=D.createElement("div");main.className="btc-commits__row-main";
      const msg=D.createElement("div");msg.className="btc-commits__row-message";msg.textContent=row.message;
      const author=D.createElement("div");author.className="btc-commits__row-author";author.textContent=row.author;
      const time=D.createElement("div");time.className="btc-commits__row-time";time.textContent=ago(row.date);time.title=new Date(row.date).toLocaleString();
      main.append(msg,author);item.append(sha,main,time);host.appendChild(item);
    }
  }
  function render(root,m,source,transport){
    set(root,"[data-commits-sha]",m.latest.shortSha);set(root,"[data-commits-message]",m.latest.message);
    set(root,"[data-commits-24h]",String(m.count24));set(root,"[data-commits-7d]",String(m.count7d));
    set(root,"[data-commits-authors]",String(m.authorCount));set(root,"[data-commits-count]",`${m.sampleSize}${m.sampleLimited?"+":""}`);
    set(root,"[data-commits-meta]",`${source} · ${transport} · latest ${ago(m.latest.date)}${m.sampleLimited?" · recent-count metrics limited to latest 100 commits":""}`);
    renderList(root,m.rows);
  }
  async function refresh(root,state){
    if(state.busy||!root.isConnected)return;state.busy=true;status(root,"refreshing","warn");
    try{const r=await W.ZZXBTCCommitsFetch.load();const m=W.ZZXBTCCommitsModel.build(r.payload);state.model=m;render(root,m,r.source,r.transport);status(root,"live","ok")}
    catch(e){status(root,state.model?"stale":"offline",state.model?"warn":"error");set(root,"[data-commits-meta]",String(e?.message||e))}
    finally{state.busy=false}
  }
  async function boot(root,core){
    if(!root)return;const state={busy:false,model:null,timer:null};root.__zzxBTCCommitsState=state;
    try{
      await ensure(core||W.ZZXWidgetsCore||null);q(root,"[data-commits-refresh]")?.addEventListener("click",()=>refresh(root,state));await refresh(root,state);
      async function loop(){if(!root.isConnected)return;await refresh(root,state);state.timer=W.setTimeout(loop,REFRESH_MS)}
      state.timer=W.setTimeout(loop,REFRESH_MS);
    }catch(e){status(root,"offline","error");set(root,"[data-commits-meta]",String(e?.message||e))}
  }
  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);
  else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);
  else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);
})();

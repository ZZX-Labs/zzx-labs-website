// __partials/widgets/btc-repo/widget.js
(function () {
  "use strict";

  const W = window;
  const D = document;
  const ID = "btc-repo";
  const REPO_KEY = "zzx.widget.btc-repo.repo";

  function q(root,selector){ return root ? root.querySelector(selector) : null; }

  function status(root,label,state) {
    const el=q(root,"[data-repo-status]");
    if (!el) return;
    el.textContent=label;
    el.setAttribute("data-status",state || "offline");
  }

  function safeGet() {
    try { return W.localStorage.getItem(REPO_KEY); }
    catch (_) { return null; }
  }

  function safeSet(value) {
    try { W.localStorage.setItem(REPO_KEY,value); }
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

  async function ensureProvider(core) {
    if (W.ZZXRepoProvider?.load) return;

    const base=core?.widgetBase
      ? String(core.widgetBase(ID)).replace(/\/+$/g,"")
      : "/__partials/widgets/btc-repo";

    const src=W.ZZXAPI?.url
      ? W.ZZXAPI.url(`${base}/js/provider.js`)
      : `${base}/js/provider.js`;

    await new Promise((resolve,reject)=>{
      const s=D.createElement("script");
      s.src=src;
      s.defer=true;
      s.addEventListener("load",resolve,{once:true});
      s.addEventListener("error",reject,{once:true});
      (D.head||D.documentElement).appendChild(s);
    });

    if (!W.ZZXRepoProvider?.load) throw new Error("repository provider unavailable");
  }

  function repoFor(state) {
    const list=W.ZZXRepoProvider.REPOS;
    return list[state.index % list.length];
  }

  function count(v) {
    const n=Number(v);
    return Number.isFinite(n) ? Math.round(n).toLocaleString() : "—";
  }

  function render(root,state) {
    const data=state.data;
    const spec=repoFor(state);

    q(root,"[data-repo-name]").textContent=spec.label;
    q(root,"[data-repo-sub]").textContent=
      `${spec.repo} · ${data?.partial ? "partial GitHub response" : "repository + commits + release"}`;

    q(root,"[data-repo-stars]").textContent=count(data?.meta?.stars);
    q(root,"[data-repo-forks]").textContent=count(data?.meta?.forks);
    q(root,"[data-repo-issues]").textContent=count(data?.meta?.issues);
    q(root,"[data-repo-branch]").textContent=data?.meta?.branch || "—";

    const release=q(root,"[data-repo-release]");
    if (release) {
      if (data?.release) {
        release.textContent=`${data.release.name}${data.release.tag ? " · "+data.release.tag : ""}`;
        release.href=data.release.url;
        release.removeAttribute("aria-disabled");
      } else {
        release.textContent="no published release";
        release.href=data?.meta?.htmlUrl || `https://github.com/${spec.repo}`;
        release.setAttribute("aria-disabled","true");
      }
    }

    const list=q(root,"[data-repo-list]");
    list.replaceChildren();

    const commits=data?.commits || [];

    if (!commits.length) {
      const empty=D.createElement("div");
      empty.className="btc-repo__empty";
      empty.textContent="No commit data available.";
      list.appendChild(empty);
    } else {
      for (const item of commits.slice(0,5)) {
        const row=D.createElement("article");
        row.className="btc-repo__item";

        const sha=D.createElement("span");
        sha.className="btc-repo__sha";
        sha.textContent=item.sha.slice(0,7);

        const main=D.createElement("div");
        main.className="btc-repo__item-main";

        const link=D.createElement("a");
        link.href=item.url;
        link.target="_blank";
        link.rel="noopener noreferrer";
        link.textContent=item.message;

        const detail=D.createElement("small");
        detail.textContent=`${item.author} · ${spec.repo}`;

        main.append(link,detail);

        const time=D.createElement("time");
        time.dateTime=item.ts ? new Date(item.ts).toISOString() : "";
        time.textContent=ago(item.ts);

        row.append(sha,main,time);
        list.appendChild(row);
      }
    }

    q(root,"[data-repo-meta]").textContent=
      `${spec.repo} · GitHub public API · refreshed ${new Date().toLocaleTimeString()}`;

    status(root,data?.partial ? "partial" : "live",data?.partial ? "warn" : "ok");
  }

  async function loadCurrent(root,state,force=false) {
    if (state.busy || !root.isConnected) return;

    state.busy=true;
    status(root,"loading","warn");

    try {
      state.data=await W.ZZXRepoProvider.load(repoFor(state),force);
      render(root,state);
    } catch (error) {
      status(root,state.data ? "stale" : "offline",state.data ? "warn" : "error");
      q(root,"[data-repo-meta]").textContent=String(error?.message || error);
    } finally {
      state.busy=false;
    }
  }

  function setIndex(root,state,index,force=false) {
    const repos=W.ZZXRepoProvider.REPOS;
    state.index=((index % repos.length)+repos.length)%repos.length;

    const select=q(root,"[data-repo-select]");
    if (select) select.value=repos[state.index].id;

    safeSet(repos[state.index].id);
    loadCurrent(root,state,force);
  }

  async function boot(root,core) {
    if (!root) return;

    const state={
      index:0,
      data:null,
      busy:false,
      rotateTimer:null,
      refreshTimer:null
    };

    root.__zzxRepoState=state;

    try {
      await ensureProvider(core || W.ZZXWidgetsCore || null);

      const select=q(root,"[data-repo-select]");
      select.replaceChildren();

      for (const repo of W.ZZXRepoProvider.REPOS) {
        const option=D.createElement("option");
        option.value=repo.id;
        option.textContent=repo.label;
        select.appendChild(option);
      }

      const saved=safeGet();
      const found=W.ZZXRepoProvider.REPOS.findIndex(repo=>repo.id===saved);
      state.index=found>=0 ? found : 0;
      select.value=repoFor(state).id;

      select.addEventListener("change",()=>{
        const idx=W.ZZXRepoProvider.REPOS.findIndex(repo=>repo.id===select.value);
        setIndex(root,state,idx,false);
      });

      q(root,"[data-repo-next]")?.addEventListener("click",()=>{
        setIndex(root,state,state.index+1,false);
      });

      q(root,"[data-repo-refresh]")?.addEventListener("click",()=>{
        loadCurrent(root,state,true);
      });

      await loadCurrent(root,state,false);

      function rotateLoop() {
        if (!root.isConnected) return;
        setIndex(root,state,state.index+1,false);
        state.rotateTimer=W.setTimeout(rotateLoop,90000);
      }

      async function refreshLoop() {
        if (!root.isConnected) return;
        await loadCurrent(root,state,false);
        state.refreshTimer=W.setTimeout(refreshLoop,300000);
      }

      state.rotateTimer=W.setTimeout(rotateLoop,90000);
      state.refreshTimer=W.setTimeout(refreshLoop,300000);
    } catch (error) {
      status(root,"offline","error");
      q(root,"[data-repo-meta]").textContent=String(error?.message || error);
    }
  }

  if (W.ZZXAPI?.register) W.ZZXAPI.register(ID,boot);
  else if (W.ZZXWidgetsCore?.onMount) W.ZZXWidgetsCore.onMount(ID,boot);
  else if (W.ZZXWidgets?.register) W.ZZXWidgets.register(ID,boot);
})();

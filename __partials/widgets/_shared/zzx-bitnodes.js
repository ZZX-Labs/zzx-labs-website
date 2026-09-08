(function(){
  "use strict";

  const W=window;
  const D=document;

  if(W.ZZXBitnodes?.__version>=5)return;

  const DEFAULT_REFRESH_MS=60_000;
  const DEFAULT_STALE_MS=24*60*60*1000;
  const CONFIG_URL="/bitcoin/bitnodes/api/sources.json";
  const HISTORY_URL="/bitcoin/bitnodes/api/history.json";
  const EVENT="zzx:bitnodes:update";
  const CACHE_KEY="zzx.bitnodes.shared.snapshot.v4";
  const HISTORY_KEY="zzx.bitnodes.shared.history.v4";
  const HISTORY_MAX=1440;

  const state={
    snapshot:null,
    raw:null,
    source:null,
    transport:null,
    stale:false,
    updatedAt:0,
    fetchedAt:0,
    inflight:null,
    config:null,
    configInflight:null,
    history:null,
    subscribers:new Set()
  };

  function finite(value){
    const n=Number(value);
    return Number.isFinite(n)?n:NaN;
  }

  function text(value){
    return String(value??"").trim();
  }

  function parseTime(value){
    if(value==null)return NaN;
    const n=finite(value);
    if(Number.isFinite(n)){
      if(n>0&&n<1e11)return n*1000;
      return n;
    }
    const ms=Date.parse(String(value));
    return Number.isFinite(ms)?ms:NaN;
  }

  function localURL(path){
    return W.ZZXAPI?.url?W.ZZXAPI.url(path):path;
  }

  function cacheRead(){
    try{
      const row=JSON.parse(W.localStorage.getItem(CACHE_KEY)||"null");
      if(!row||typeof row!=="object"||!row.snapshot)return null;
      return row;
    }catch(_){
      return null;
    }
  }

  function cacheWrite(){
    try{
      W.localStorage.setItem(CACHE_KEY,JSON.stringify({
        snapshot:state.snapshot,
        source:state.source,
        transport:state.transport,
        stale:state.stale,
        updatedAt:state.updatedAt,
        fetchedAt:state.fetchedAt
      }));
    }catch(_){}
  }

  function historyReadLocal(){
    try{
      const rows=JSON.parse(W.localStorage.getItem(HISTORY_KEY)||"[]");
      return Array.isArray(rows)?rows:[];
    }catch(_){
      return [];
    }
  }

  function historyWriteLocal(rows){
    try{
      W.localStorage.setItem(
        HISTORY_KEY,
        JSON.stringify(rows.slice(-HISTORY_MAX))
      );
    }catch(_){}
  }

  function addHistoryPoint(snapshot){
    const total=finite(snapshot?.reachableNodes??snapshot?.totalNodes);
    const t=finite(snapshot?.updatedMs)||Date.now();
    if(!(Number.isFinite(total)&&total>0))return;

    const rows=historyReadLocal();
    const last=rows.at(-1);

    if(
      !last ||
      Math.abs(t-finite(last.t))>=30_000 ||
      finite(last.total)!==total
    ){
      rows.push({t,total});
      historyWriteLocal(rows);
    }
  }

  async function fetchJSON(url,{local=false,timeoutMs=12_000}={}){
    if(W.ZZXAPI?.jsonStrict){
      return await W.ZZXAPI.jsonStrict(
        local?localURL(url):url,
        {
          cacheBust:local,
          timeoutMs,
          retries:1
        }
      );
    }

    const controller=typeof AbortController==="function"
      ? new AbortController()
      : null;

    const timer=controller
      ? W.setTimeout(()=>controller.abort(),timeoutMs)
      : null;

    try{
      const r=await fetch(
        local?localURL(url):url,
        {
          cache:"no-store",
          credentials:local?"same-origin":"omit",
          signal:controller?.signal
        }
      );
      if(!r.ok){
        const error=new Error(`HTTP ${r.status} ${url}`);
        error.status=r.status;
        throw error;
      }
      return await r.json();
    }finally{
      if(timer)W.clearTimeout(timer);
    }
  }

  function normalizeMirrorBase(value){
    const s=text(value).replace(/\/+$/g,"");
    if(!s)return "";
    if(/\/api\/v1$/i.test(s))return s;
    return `${s}/api/v1`;
  }

  async function config(force=false){
    if(state.config&&!force)return state.config;
    if(state.configInflight&&!force)return await state.configInflight;

    state.configInflight=(async()=>{
      let payload=null;
      try{
        payload=await fetchJSON(CONFIG_URL,{local:true});
      }catch(_){}

      const localCandidates=[
        "/bitcoin/bitnodes/api/zzxbitnodes/latest.json",
        "/bitcoin/bitnodes/api/snapshots/latest.json",
        "/bitcoin/bitnodes/api/originalbitnodes/latest.json",
        "/bitcoin/bitnodes/api/aggregate/zzxbitnodes/latest.json"
      ];

      const upstreams=[
        {
          id:"btcnodes.io",
          base:"https://btcnodes.io/api/v1",
          enabled:true,
          priority:0
        }
      ];

      for(const row of Array.isArray(payload?.mirrors)?payload.mirrors:[]){
        if(row?.enabled===false)continue;
        const base=normalizeMirrorBase(row?.base||row?.url);
        if(!base)continue;
        upstreams.push({
          id:text(row.id)||base,
          base,
          enabled:true,
          priority:Number.isFinite(finite(row.priority))
            ? finite(row.priority)
            : 100
        });
      }

      upstreams.sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id));

      state.config=Object.freeze({
        refreshMs:Number.isFinite(finite(payload?.refresh_ms))
          ? Math.max(15_000,finite(payload.refresh_ms))
          : DEFAULT_REFRESH_MS,
        staleMs:Number.isFinite(finite(payload?.stale_ms))
          ? Math.max(60_000,finite(payload.stale_ms))
          : DEFAULT_STALE_MS,
        localFreshMs:Number.isFinite(finite(payload?.local_fresh_ms))
          ? Math.max(60_000,finite(payload.local_fresh_ms))
          : 900_000,
        browserDirectUpstream:
          payload?.browser_direct_upstream===true,
        localCandidates:Array.isArray(payload?.local_candidates)
          ? payload.local_candidates.filter(Boolean)
          : localCandidates,
        upstreams
      });

      return state.config;
    })().finally(()=>{
      state.configInflight=null;
    });

    return await state.configInflight;
  }

  function unwrap(payload){
    let cur=payload;
    for(let i=0;i<10;i++){
      if(!cur||typeof cur!=="object")return {};
      if(Array.isArray(cur))return cur;
      const next=
        cur.data ??
        cur.result ??
        cur.results ??
        cur.snapshot ??
        cur.latest;
      if(next&&next!==cur){
        cur=next;
        continue;
      }
      return cur;
    }
    return cur&&typeof cur==="object"?cur:{};
  }

  function networkFromAddress(address){
    const s=text(address).toLowerCase();

    if(s.includes(".onion"))return "tor";
    if(s.includes(".i2p"))return "i2p";
    if(s.includes(".b32.i2p"))return "i2p";
    if(s.includes(".cjdns"))return "cjdns";

    const bracket=s.match(/^\[([^\]]+)\](?::\d+)?$/);
    if(bracket)return "ipv6";

    const host=s.replace(/:\d+$/,"");
    if(/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host))return "ipv4";
    if(host.includes(":"))return "ipv6";
    return "other";
  }

  function valueAt(value,index){
    return Array.isArray(value)?value[index]:undefined;
  }

  function normalizeNode(address,value){
    const object=value&&typeof value==="object"&&!Array.isArray(value)
      ? value
      : {};

    const userAgent=text(
      object.user_agent ??
      object.userAgent ??
      object.subversion ??
      valueAt(value,1)
    );

    const protocol=finite(
      object.protocol_version ??
      object.protocolVersion ??
      object.version ??
      valueAt(value,0)
    );

    const height=finite(
      object.height ??
      object.block_height ??
      object.latest_height ??
      valueAt(value,4)
    );

    const hostname=text(
      object.hostname ??
      object.host ??
      valueAt(value,5)
    );

    const city=text(
      object.city ??
      object.geo?.city ??
      valueAt(value,6)
    );

    const country=text(
      object.country ??
      object.country_code ??
      object.geo?.country ??
      object.geo?.country_code ??
      valueAt(value,7)
    ).toUpperCase();

    const latitude=finite(
      object.latitude ??
      object.lat ??
      object.geo?.latitude ??
      object.geo?.lat ??
      valueAt(value,8)
    );

    const longitude=finite(
      object.longitude ??
      object.lon ??
      object.lng ??
      object.geo?.longitude ??
      object.geo?.lon ??
      object.geo?.lng ??
      valueAt(value,9)
    );

    const timezone=text(
      object.timezone ??
      object.geo?.timezone ??
      valueAt(value,10)
    );

    const asn=text(
      object.asn ??
      object.as_number ??
      object.geo?.asn ??
      valueAt(value,11)
    );

    const organization=text(
      object.organization ??
      object.org ??
      object.isp ??
      object.geo?.organization ??
      valueAt(value,12)
    );

    const county=text(
      object.county ??
      object.admin2 ??
      object.geo?.county ??
      object.geo?.admin2
    );

    const region=text(
      object.region ??
      object.state ??
      object.admin1 ??
      object.geo?.region ??
      object.geo?.state ??
      object.geo?.admin1
    );

    const services=
      object.services ??
      valueAt(value,3) ??
      null;

    const connectedSince=finite(
      object.connected_since ??
      object.connectedSince ??
      valueAt(value,2)
    );

    return Object.freeze({
      address:text(address),
      network:text(object.network)||networkFromAddress(address),
      protocolVersion:Number.isFinite(protocol)?protocol:null,
      userAgent:userAgent||null,
      connectedSince:Number.isFinite(connectedSince)?connectedSince:null,
      services,
      height:Number.isFinite(height)?height:null,
      hostname:hostname||null,
      city:city||null,
      county:county||null,
      region:region||null,
      country:country||null,
      latitude:Number.isFinite(latitude)?latitude:null,
      longitude:Number.isFinite(longitude)?longitude:null,
      timezone:timezone||null,
      asn:asn||null,
      organization:organization||null
    });
  }

  function inc(map,key){
    const k=text(key)||"Unknown";
    map[k]=(map[k]||0)+1;
  }

  function normalizeNodes(raw){
    const out=[];

    if(raw&&typeof raw==="object"&&!Array.isArray(raw)){
      for(const [address,value] of Object.entries(raw)){
        out.push(normalizeNode(address,value));
      }
      return out;
    }

    if(Array.isArray(raw)){
      for(const row of raw){
        if(Array.isArray(row)){
          const address=text(row[0]);
          if(address)out.push(normalizeNode(address,row.slice(1)));
        }else if(row&&typeof row==="object"){
          const address=text(
            row.address ??
            row.addr ??
            row.endpoint ??
            row.host ??
            row.node
          );
          if(address)out.push(normalizeNode(address,row));
        }
      }
    }

    return out;
  }

  function declaredCount(obj,names){
    for(const name of names){
      const n=finite(obj?.[name]);
      if(Number.isFinite(n)&&n>=0)return n;
    }
    return NaN;
  }

  function aggregate(nodes){
    const byNetwork={};
    const byVersion={};
    const byNation={};
    const byCity={};
    const byCounty={};
    let latestHeight=NaN;

    for(const node of nodes){
      inc(byNetwork,node.network||"other");
      inc(byVersion,node.userAgent||"Unknown");

      if(node.country)inc(byNation,node.country);
      if(node.city){
        inc(
          byCity,
          node.country
            ? `${node.city}, ${node.country}`
            : node.city
        );
      }
      if(node.county){
        const location=[
          node.county,
          node.region,
          node.country
        ].filter(Boolean).join(", ");
        inc(byCounty,location);
      }

      const h=finite(node.height);
      if(Number.isFinite(h)){
        latestHeight=Number.isFinite(latestHeight)
          ? Math.max(latestHeight,h)
          : h;
      }
    }

    return {
      byNetwork,
      byVersion,
      byNation,
      byCity,
      byCounty,
      latestHeight
    };
  }

  function normalize(payload,source="unknown"){
    const obj=unwrap(payload);
    const root=Array.isArray(obj)?{nodes:obj}:obj;

    const nodes=normalizeNodes(
      root.nodes ??
      root.node_map ??
      root.peers ??
      root.entries
    );

    const agg=aggregate(nodes);

    let reachable=declaredCount(root,[
      "reachable_nodes",
      "reachable",
      "total_nodes",
      "total",
      "count"
    ]);

    if(!(reachable>=0)&&nodes.length){
      reachable=nodes.length;
    }

    let total=declaredCount(root,[
      "total_nodes",
      "total",
      "reachable_nodes",
      "reachable",
      "count"
    ]);

    if(!(total>=0)){
      total=reachable;
    }

    let latestHeight=declaredCount(root,[
      "latest_height",
      "block_height",
      "height"
    ]);

    if(!Number.isFinite(latestHeight)){
      latestHeight=agg.latestHeight;
    }

    const updatedMs=parseTime(
      root.generated_at ??
      root.updated_at ??
      root.timestamp ??
      root.ts ??
      root.snapshot_timestamp ??
      root.created_at
    );

    const byNetwork={
      ...agg.byNetwork
    };

    const counts=
      root.counts ??
      root.network_counts ??
      root.network ??
      {};

    const declaredNetworks={
      ipv4:declaredCount(counts,["ipv4","ipv4_nodes"]),
      ipv6:declaredCount(counts,["ipv6","ipv6_nodes"]),
      tor:declaredCount(counts,["tor","onion","tor_nodes","onion_nodes"]),
      i2p:declaredCount(counts,["i2p","i2p_nodes"]),
      cjdns:declaredCount(counts,["cjdns","cjdns_nodes"]),
      other:declaredCount(counts,["other","other_nodes"])
    };

    for(const [key,value] of Object.entries(declaredNetworks)){
      if(Number.isFinite(value))byNetwork[key]=value;
    }

    const knownNetworkTotal=[
      "ipv4","ipv6","tor","i2p","cjdns"
    ].reduce((sum,key)=>sum+(Number(byNetwork[key])||0),0);

    if(
      !Number.isFinite(finite(byNetwork.other)) &&
      Number.isFinite(reachable)
    ){
      byNetwork.other=Math.max(0,reachable-knownNetworkTotal);
    }

    const snapshot=Object.freeze({
      schema:"zzx-bitnodes-normalized-v5",
      source,
      reachableNodes:Number.isFinite(reachable)?reachable:null,
      totalNodes:Number.isFinite(total)?total:null,
      latestHeight:Number.isFinite(latestHeight)?latestHeight:null,
      updatedMs:Number.isFinite(updatedMs)?updatedMs:null,
      nodeCount:nodes.length,
      nodes:Object.freeze(nodes),
      byNetwork:Object.freeze(byNetwork),
      byVersion:Object.freeze(agg.byVersion),
      byNation:Object.freeze(agg.byNation),
      byCity:Object.freeze(agg.byCity),
      byCounty:Object.freeze(agg.byCounty)
    });

    return snapshot;
  }

  function usable(snapshot){
    return !!(
      snapshot &&
      (
        finite(snapshot.reachableNodes)>0 ||
        finite(snapshot.totalNodes)>0 ||
        finite(snapshot.nodeCount)>0
      )
    );
  }

  function publish(){
    const detail=Object.freeze({
      snapshot:state.snapshot,
      source:state.source,
      transport:state.transport,
      stale:state.stale,
      fetchedAt:state.fetchedAt
    });

    W.ZZXBitnodesLatest=state.snapshot;
    W.ZZXNodesLatest=state.snapshot;

    try{
      W.dispatchEvent(
        new CustomEvent(EVENT,{detail})
      );
    }catch(_){}

    for(const fn of state.subscribers){
      try{fn(detail)}catch(_){}
    }
  }

  async function candidateList(){
    const cfg=await config();
    const rows=[];

    for(const path of cfg.localCandidates){
      rows.push({
        id:path,
        url:path,
        local:true,
        transport:"local-mirror"
      });
    }

    if(cfg.browserDirectUpstream){
      for(const upstream of cfg.upstreams){
        rows.push({
          id:upstream.id,
          url:`${upstream.base}/snapshots/latest/`,
          local:false,
          transport:"upstream"
        });
      }
    }

    return rows;
  }

  async function load(force=false){
    const cfg=await config();

    if(
      !force &&
      usable(state.snapshot) &&
      Date.now()-state.fetchedAt<cfg.refreshMs
    ){
      return stateView();
    }

    if(state.inflight)return await state.inflight;

    state.inflight=(async()=>{
      let lastError=null;
      let staleLocal=null;

      for(const candidate of await candidateList()){
        try{
          const payload=await fetchJSON(
            candidate.url,
            {
              local:candidate.local,
              timeoutMs:12_000
            }
          );

          const snapshot=normalize(payload,candidate.id);

          if(!usable(snapshot)){
            throw new Error(`${candidate.id} contained no usable node snapshot`);
          }

          const stamp=finite(snapshot.updatedMs);
          const snapshotAge=
            Number.isFinite(stamp)
              ? Math.max(0,Date.now()-stamp)
              : NaN;

          if(
            candidate.local &&
            Number.isFinite(snapshotAge) &&
            snapshotAge>cfg.localFreshMs
          ){
            if(
              snapshotAge<=cfg.staleMs &&
              (
                !staleLocal ||
                stamp>finite(staleLocal.snapshot?.updatedMs)
              )
            ){
              staleLocal={snapshot,payload,candidate};
            }

            lastError=new Error(
              `${candidate.id} local snapshot is ${Math.round(snapshotAge/1000)}s old`
            );
            continue;
          }

          state.snapshot=snapshot;
          state.raw=payload;
          state.source=candidate.id;
          state.transport=candidate.transport;
          state.stale=false;
          state.updatedAt=finite(snapshot.updatedMs)||Date.now();
          state.fetchedAt=Date.now();

          addHistoryPoint(snapshot);
          cacheWrite();
          publish();
          return stateView();
        }catch(error){
          lastError=error;
        }
      }

      if(staleLocal){
        state.snapshot=staleLocal.snapshot;
        state.raw=staleLocal.payload;
        state.source=staleLocal.candidate.id;
        state.transport="local-mirror-stale";
        state.stale=true;
        state.updatedAt=finite(staleLocal.snapshot.updatedMs)||0;
        state.fetchedAt=Date.now();

        addHistoryPoint(staleLocal.snapshot);
        cacheWrite();
        publish();
        return stateView();
      }

      const cached=cacheRead();
      if(cached?.snapshot){
        state.snapshot=cached.snapshot;
        state.source=cached.source||"localStorage";
        state.transport="stale-cache";
        state.stale=true;
        state.updatedAt=finite(cached.updatedAt)||0;
        state.fetchedAt=finite(cached.fetchedAt)||0;
        publish();
        return stateView();
      }

      if(!cfg.browserDirectUpstream){
        throw new Error(
          "Local Bitnodes mirror is not seeded. Run ZZX Data Mirror Master once to generate " +
          "/bitcoin/bitnodes/api/zzxbitnodes/latest.json."
        );
      }

      throw lastError||new Error("all Bitnodes sources unavailable");
    })().finally(()=>{
      state.inflight=null;
    });

    return await state.inflight;
  }

  async function history(force=false){
    if(state.history&&!force)return state.history;

    let remote=[];
    try{
      const payload=await fetchJSON(HISTORY_URL,{local:true});
      const rows=Array.isArray(payload)
        ? payload
        : (
            payload?.history ??
            payload?.rows ??
            payload?.snapshots ??
            []
          );
      if(Array.isArray(rows)){
        remote=rows.map(row=>({
          t:parseTime(
            row?.t ??
            row?.timestamp ??
            row?.updated_at ??
            row?.generated_at
          ),
          total:finite(
            row?.reachable_nodes ??
            row?.reachableNodes ??
            row?.total_nodes ??
            row?.totalNodes ??
            row?.total
          )
        })).filter(row=>Number.isFinite(row.t)&&Number.isFinite(row.total));
      }
    }catch(_){}

    const local=historyReadLocal()
      .map(row=>({
        t:finite(row?.t),
        total:finite(row?.total)
      }))
      .filter(row=>Number.isFinite(row.t)&&Number.isFinite(row.total));

    const byTime=new Map();
    for(const row of [...remote,...local]){
      byTime.set(row.t,row);
    }

    state.history=[...byTime.values()]
      .sort((a,b)=>a.t-b.t)
      .slice(-HISTORY_MAX);

    return state.history;
  }

  function stateView(){
    return Object.freeze({
      snapshot:state.snapshot,
      raw:state.raw,
      source:state.source,
      transport:state.transport,
      stale:state.stale,
      updatedAt:state.updatedAt,
      fetchedAt:state.fetchedAt
    });
  }

  function subscribe(fn,{immediate=true}={}){
    if(typeof fn!=="function"){
      return ()=>{};
    }

    state.subscribers.add(fn);

    if(immediate&&state.snapshot){
      try{fn(stateView())}catch(_){}
    }

    return ()=>{
      state.subscribers.delete(fn);
    };
  }

  function current(){
    return stateView();
  }

  W.ZZXBitnodes=Object.freeze({
    __version:5,
    EVENT,
    load,
    current,
    history,
    normalize,
    config,
    subscribe
  });
})();

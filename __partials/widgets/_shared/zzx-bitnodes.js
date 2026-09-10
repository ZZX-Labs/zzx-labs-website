(function(){
  "use strict";

  const W=window;
  const D=document;

  if(W.ZZXBitnodes?.__version>=8)return;

  const DEFAULT_REFRESH_MS=60_000;
  const DEFAULT_STALE_MS=24*60*60*1000;
  const CONFIG_URL="/bitcoin/bitnodes/api/sources.json";
  const HISTORY_URL="/bitcoin/bitnodes/api/history.json";
  const EVENT="zzx:bitnodes:update";
  const CACHE_KEY="zzx.bitnodes.shared.snapshot.v8";
  const HISTORY_KEY="zzx.bitnodes.shared.history.v4";
  const HISTORY_MAX=1440;
  const GEOGRAPHY_CANDIDATES=[
    "/bitcoin/bitnodes/maps/data/nodes.geojson",
    "/bitcoin/bitnodes/live-map/data/nodes.geojson",
    "/bitcoin/bitnodes/maps/zzxbitnodes/data/nodes.geojson",
    "/bitcoin/bitnodes/live-map/zzxbitnodes/data/nodes.geojson",
    "/bitcoin/bitnodes/maps/data/map-points.geojson",
    "/bitcoin/bitnodes/live-map/data/map-points.geojson",
    "/bitcoin/bitnodes/maps/data/map-nodes.json",
    "/bitcoin/bitnodes/live-map/data/map-nodes.json"
  ];

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
    geographyPayload:null,
    geographySource:null,
    geographyFetchedAt:0,
    geographyInflight:null,
    subscribers:new Set()
  };

  function finite(value){
    const n=Number(value);
    return Number.isFinite(n)?n:NaN;
  }

  function text(value){
    return String(value??"").trim();
  }

  function normalizeCountryCode(value){
    const iso=text(value).toUpperCase();
    return /^[A-Z]{2}$/.test(iso)?iso:"";
  }

  function countryFlag(value){
    const iso=normalizeCountryCode(value);
    if(!iso)return "🏴";
    return String.fromCodePoint(...[...iso].map(ch=>127397+ch.charCodeAt(0)));
  }

  function countryName(value,hint=""){
    const iso=normalizeCountryCode(value);
    const supplied=text(hint);
    if(supplied&&!/^(unknown|n\/?a|null|none|--)$/i.test(supplied))return supplied;
    if(!iso)return "Unlocated";
    if(iso==="XK")return "Kosovo";
    try{
      if(typeof Intl?.DisplayNames==="function"){
        const names=new Intl.DisplayNames(["en"],{type:"region"});
        const label=names.of(iso);
        if(label&&label!==iso)return label;
      }
    }catch(_){}
    return iso;
  }

  function countryMeta(code,nameHint="",flagHint=""){
    const iso=normalizeCountryCode(code);
    const name=countryName(iso,nameHint);
    const flag=iso?(text(flagHint)||countryFlag(iso)):"🏴";
    return Object.freeze({
      code:iso||"--",
      name:iso?name:"Unlocated",
      flag,
      located:!!iso,
      label:iso?`${flag} ${name} · ${iso}`:`${flag} Unlocated · --`
    });
  }

  function addressKey(value){
    return text(value).toLowerCase();
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
        "/bitcoin/bitnodes/api/snapshots/latest.json",
        "/bitcoin/bitnodes/api/zzxbitnodes/latest.json",
        "/bitcoin/bitnodes/api/btcnodes/normalized/latest.json",
        "/bitcoin/bitnodes/api/aggregate/canonical/latest.json"
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

    const rawCountry=(
      object.country ??
      object.country_code ??
      object.geo?.country ??
      object.geo?.country_code ??
      valueAt(value,7)
    );

    const rawCountryName=text(
      object.country_name ??
      object.geo?.country_name ??
      object.geo_contract?.country_name
    );

    const rawCountryFlag=text(
      object.country_flag ??
      object.geo?.country_flag ??
      object.geo_contract?.country_flag
    );

    const countryInfo=countryMeta(rawCountry,rawCountryName,rawCountryFlag);
    const country=countryInfo.located?countryInfo.code:"";
    const resolvedCountryName=countryInfo.located?countryInfo.name:"";
    const resolvedCountryFlag=countryInfo.located?countryInfo.flag:"";

    const admin1Code=text(
      object.admin1_code ??
      object.region_code ??
      object.geo?.admin1_code ??
      object.geo_contract?.admin1_code
    ).toUpperCase();

    const admin2Code=text(
      object.admin2_code ??
      object.county_code ??
      object.geo?.admin2_code ??
      object.geo_contract?.admin2_code
    ).toUpperCase();

    const ip=text(
      object.ip ??
      object.geo_contract?.ip
    );

    const geoSource=text(
      object.geo_source ??
      object.geo?.source ??
      object.geo_contract?.source
    );

    const geoSynthetic=(
      object.geo_contract?.synthetic===true ||
      /synthetic|deterministic-fallback|workflow-map-ready-fallback/i.test(
        `${object.geo_confidence??""} ${object.geo_source??""} ${object.geoip_confidence??""} ${object.geoip_source??""}`
      )
    );

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

    const latencyMs=finite(
      object.latency_ms ??
      object.latencyMs ??
      object.ping_ms ??
      object.pingMs
    );

    const reachableNowRaw=
      object.reachable_now ??
      object.reachableNow ??
      object.reachable;

    const reachable24hRaw=
      object.reachable_24h ??
      object.reachable24h;

    const duplicateCount=finite(
      object.duplicate_count ??
      object.duplicateCount
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
      countryName:resolvedCountryName||null,
      countryFlag:resolvedCountryFlag||null,
      admin1Code:admin1Code||null,
      admin2Code:admin2Code||null,
      ip:ip||null,
      geoSource:geoSource||null,
      geoSynthetic,
      latitude:!geoSynthetic&&Number.isFinite(latitude)?latitude:null,
      longitude:!geoSynthetic&&Number.isFinite(longitude)?longitude:null,
      timezone:timezone||null,
      asn:asn||null,
      organization:organization||null,
      latencyMs:Number.isFinite(latencyMs)?latencyMs:null,
      reachableNow:typeof reachableNowRaw==="boolean"?reachableNowRaw:null,
      reachable24h:typeof reachable24hRaw==="boolean"?reachable24hRaw:null,
      duplicateCount:Number.isFinite(duplicateCount)?Math.max(1,duplicateCount):1
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

  function percentile(sorted,p){
    if(!Array.isArray(sorted)||!sorted.length)return NaN;
    const rank=(sorted.length-1)*p;
    const lo=Math.floor(rank);
    const hi=Math.ceil(rank);
    if(lo===hi)return sorted[lo];
    const w=rank-lo;
    return sorted[lo]*(1-w)+sorted[hi]*w;
  }

  function aggregate(nodes){
    const byNetwork={};
    const byVersion={};
    const byNation={};
    const byCity={};
    const byCounty={};
    const byAsn={};
    const latencies=[];
    let latestHeight=NaN;
    let reachableNow=0;
    let reachable24h=0;
    let duplicateExtra=0;

    for(const node of nodes){
      inc(byNetwork,node.network||"other");
      inc(byVersion,node.userAgent||"Unknown");

      const validCountry=/^[A-Z]{2}$/.test(node.country||"")&&!node.geoSynthetic;
      if(validCountry)inc(byNation,node.country);
      if(validCountry&&node.city)inc(byCity,`${node.city}, ${node.country}`);
      if(validCountry&&node.county&&(node.admin2Code||/^maphost-/i.test(node.geoSource||""))){
        inc(byCounty,[node.county,node.region,node.country].filter(Boolean).join(", "));
      }

      if(node.asn){
        const key=`${node.asn}|${node.organization||"Unknown organization"}|${validCountry?node.country:"--"}`;
        inc(byAsn,key);
      }

      const h=finite(node.height);
      if(Number.isFinite(h)){
        latestHeight=Number.isFinite(latestHeight)?Math.max(latestHeight,h):h;
      }

      const latency=finite(node.latencyMs);
      if(Number.isFinite(latency)&&latency>=0)latencies.push(latency);

      if(node.reachableNow===true)reachableNow+=1;
      if(node.reachable24h===true)reachable24h+=1;
      duplicateExtra+=Math.max(0,(finite(node.duplicateCount)||1)-1);
    }

    latencies.sort((a,b)=>a-b);
    const latencyCount=latencies.length;
    const latencyAvg=latencyCount?latencies.reduce((a,b)=>a+b,0)/latencyCount:NaN;

    return {
      byNetwork,
      byVersion,
      byNation,
      byCity,
      byCounty,
      byAsn,
      latestHeight,
      latency:Object.freeze({
        count:latencyCount,
        avg:Number.isFinite(latencyAvg)?latencyAvg:null,
        p50:Number.isFinite(percentile(latencies,.50))?percentile(latencies,.50):null,
        p90:Number.isFinite(percentile(latencies,.90))?percentile(latencies,.90):null,
        p95:Number.isFinite(percentile(latencies,.95))?percentile(latencies,.95):null,
        p99:Number.isFinite(percentile(latencies,.99))?percentile(latencies,.99):null
      }),
      health:Object.freeze({
        reachableNow,
        reachable24h,
        duplicateExtra
      })
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
      schema:"zzx-bitnodes-normalized-v8",
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
      byCounty:Object.freeze(agg.byCounty),
      byAsn:Object.freeze(agg.byAsn),
      latency:agg.latency,
      health:agg.health
    });

    return snapshot;
  }

  function geographyRows(payload){
    const rows=[];
    if(Array.isArray(payload?.features)){
      for(const feature of payload.features){
        if(!feature||typeof feature!=="object")continue;
        const props=feature.properties&&typeof feature.properties==="object"?feature.properties:{};
        const address=text(props.address??props.id??feature.id);
        if(address)rows.push({address,props});
      }
      return rows;
    }

    const nodes=payload?.nodes;
    if(nodes&&typeof nodes==="object"&&!Array.isArray(nodes)){
      for(const [key,value] of Object.entries(nodes)){
        if(!value||typeof value!=="object")continue;
        const address=text(value.address??value.id??key);
        if(address)rows.push({address,props:value});
      }
    }else if(Array.isArray(nodes)){
      for(const value of nodes){
        if(!value||typeof value!=="object")continue;
        const address=text(value.address??value.id);
        if(address)rows.push({address,props:value});
      }
    }
    return rows;
  }

  function syntheticGeography(props){
    if(props?.synthetic===true||props?.geo_synthetic===true)return true;
    const marker=[
      props?.coordinate_source,props?.geo_source,props?.geoip_source,
      props?.geo_confidence,props?.geoip_confidence
    ].map(text).join(" ").toLowerCase();
    return /synthetic|deterministic-fallback|workflow-map-ready-fallback/.test(marker);
  }

  function geographyUsable(payload){
    for(const row of geographyRows(payload)){
      const props=row.props||{};
      if(syntheticGeography(props))continue;
      const meta=countryMeta(
        props.country_code??props.countryCode??props.country,
        props.country_name??props.countryName,
        props.country_flag??props.countryFlag
      );
      if(meta.located)return true;
    }
    return false;
  }

  function hydrateGeography(snapshot,payload,source="maphost-local"){
    if(!snapshot||!Array.isArray(snapshot.nodes)||!snapshot.nodes.length)return snapshot;

    const index=new Map();
    for(const row of geographyRows(payload)){
      const props=row.props||{};
      if(syntheticGeography(props))continue;
      const meta=countryMeta(
        props.country_code??props.countryCode??props.country,
        props.country_name??props.countryName,
        props.country_flag??props.countryFlag
      );
      if(!meta.located)continue;
      index.set(addressKey(row.address),{props,meta});
    }

    let joined=0;
    let located=0;
    let city=0;
    let county=0;
    const nodes=snapshot.nodes.map(node=>{
      const existing=countryMeta(node?.country,node?.countryName,node?.countryFlag);
      const match=index.get(addressKey(node?.address));
      const selected=match?.meta?.located?match.meta:existing;
      if(!selected.located)return node;

      const props=match?.props||{};
      const nextCity=text(props.city)||text(node.city);
      const nextCounty=text(props.county??props.admin2)||text(node.county);
      const nextRegion=text(props.region??props.state??props.admin1)||text(node.region);
      const nextAdmin1=text(props.admin1_code??props.region_code)||text(node.admin1Code);
      const nextAdmin2=text(props.admin2_code??props.county_code)||text(node.admin2Code);
      if(match)joined+=1;
      located+=1;
      if(nextCity)city+=1;
      if(nextCounty)county+=1;

      const nextAsn=text(props.asn??props.as_number)||text(node.asn);
      const nextOrganization=text(props.organization??props.org??props.isp)||text(node.organization);
      const nextLatency=finite(props.latency_ms??props.latencyMs??node.latencyMs);
      const nextDuplicate=finite(props.duplicate_count??props.duplicateCount??node.duplicateCount);
      const nextReachableNow=
        typeof props.reachable_now==="boolean" ? props.reachable_now :
        typeof props.reachable==="boolean" ? props.reachable :
        node.reachableNow;
      const nextReachable24h=
        typeof props.reachable_24h==="boolean" ? props.reachable_24h :
        node.reachable24h;

      return Object.freeze({
        ...node,
        city:nextCity||null,
        county:nextCounty||null,
        region:nextRegion||null,
        country:selected.code,
        countryName:selected.name,
        countryFlag:selected.flag,
        admin1Code:nextAdmin1||null,
        admin2Code:nextAdmin2||null,
        asn:nextAsn||null,
        organization:nextOrganization||null,
        latencyMs:Number.isFinite(nextLatency)?nextLatency:node.latencyMs,
        duplicateCount:Number.isFinite(nextDuplicate)?Math.max(1,nextDuplicate):(node.duplicateCount||1),
        reachableNow:typeof nextReachableNow==="boolean"?nextReachableNow:node.reachableNow,
        reachable24h:typeof nextReachable24h==="boolean"?nextReachable24h:node.reachable24h,
        geoSource:match?`maphost-${source}`:(node.geoSource||"canonical"),
        geoSynthetic:false
      });
    });

    const agg=aggregate(nodes);
    return Object.freeze({
      ...snapshot,
      schema:"zzx-bitnodes-normalized-v8",
      nodes:Object.freeze(nodes),
      byVersion:Object.freeze(agg.byVersion),
      byNation:Object.freeze(agg.byNation),
      byCity:Object.freeze(agg.byCity),
      byCounty:Object.freeze(agg.byCounty),
      byAsn:Object.freeze(agg.byAsn),
      latency:agg.latency,
      health:agg.health,
      geography:Object.freeze({
        source:text(source)||"maphost-local",
        indexed:index.size,
        joined,
        located,
        city,
        county
      })
    });
  }

  async function loadGeography(force=false){
    if(
      !force &&
      state.geographyFetchedAt>0 &&
      Date.now()-state.geographyFetchedAt<DEFAULT_REFRESH_MS
    ){
      return state.geographyPayload
        ? {payload:state.geographyPayload,source:state.geographySource}
        : null;
    }
    if(state.geographyInflight&&!force)return await state.geographyInflight;

    state.geographyInflight=(async()=>{
      for(const path of GEOGRAPHY_CANDIDATES){
        try{
          const payload=await fetchJSON(path,{local:true,timeoutMs:12_000});
          if(!geographyUsable(payload))continue;
          state.geographyPayload=payload;
          state.geographySource=path;
          state.geographyFetchedAt=Date.now();
          return {payload,source:path};
        }catch(_){}
      }
      state.geographyPayload=null;
      state.geographySource=null;
      state.geographyFetchedAt=Date.now();
      return null;
    })().finally(()=>{state.geographyInflight=null;});

    return await state.geographyInflight;
  }

  async function withGeography(snapshot,force=false){
    const geo=await loadGeography(force);
    return geo?hydrateGeography(snapshot,geo.payload,geo.source):snapshot;
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
    const detail=stateView();

    W.ZZXBitnodesLatest=state.snapshot;
    W.ZZXNodesLatest=state.snapshot;

    try{
      W.dispatchEvent(new CustomEvent(EVENT,{detail}));
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

          let snapshot=normalize(payload,candidate.id);
          snapshot=await withGeography(snapshot,force);

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
      fetchedAt:state.fetchedAt,
      geographySource:state.snapshot?.geography?.source||state.geographySource||null,
      geographyJoined:Number(state.snapshot?.geography?.joined||0)
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
    __version:8,
    EVENT,
    load,
    current,
    history,
    normalize,
    hydrateGeography,
    geographyRows,
    geographyUsable,
    countryMeta,
    normalizeCountryCode,
    countryFlag,
    countryName,
    config,
    subscribe
  });
})();

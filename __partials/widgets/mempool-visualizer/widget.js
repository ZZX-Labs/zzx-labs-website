// ZZX-Labs Mempool Visualizer v1.0.0
(function(){
  "use strict";

  const W=window,D=document,ID="mempool-visualizer";
  if(W.__ZZX_MEMPOOL_VISUALIZER_V1__)return;
  W.__ZZX_MEMPOOL_VISUALIZER_V1__=true;

  const STORAGE="zzx.mempoolVisualizer.settings.v1";
  const PINS="zzx.mempoolVisualizer.pins.v1";
  const DEFAULTS={
    preset:"zen",theme:"zzx-tranquil",physics:"tide",scale:"amount",color:"fee",topology:"priority",
    budget:1024,fps:45,force:30,damping:88,trails:18,glow:34,gap:.5,
    cursorGravity:true,labels:false,reducedMotion:false,demoFallback:true
  };
  const CHOICES={
    physics:{settle:"Still Water",tide:"Tidal Field",drift:"Brownian Drift",gravity:"Gravity Well",orbit:"Quiet Orbit",breathe:"Blockspace Breath",storm:"Congestion Storm"},
    scale:{amount:"BTC Amount",fee:"Absolute Fee",vsize:"Virtual Bytes",feerate:"Fee Rate"},
    color:{fee:"Fee Heat",amount:"BTC Amount",absoluteFee:"Absolute Fee",vsize:"Virtual Bytes",age:"Mempool Age",hash:"Hash Spectrum"},
    topology:{priority:"Miner Priority",fee:"Fee Bands",amount:"Whale Field",age:"Age Strata",hash:"Hash Shuffle",spectrum:"Fee Spectrum"},
    budget:{256:"256 TX",512:"512 TX",1024:"1,024 TX",1536:"1,536 TX",2048:"2,048 TX",4096:"4,096 TX"},
    fps:{20:"20 FPS",30:"30 FPS",36:"36 FPS",45:"45 FPS",60:"60 FPS"}
  };
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const finite=(v,f=NaN)=>{const n=Number(v);return Number.isFinite(n)?n:f};
  const validTxid=v=>/^[0-9a-f]{64}$/i.test(String(v||""));
  const fmtInt=v=>Number.isFinite(finite(v))?Math.round(Number(v)).toLocaleString():"—";
  const fmtRate=v=>Number.isFinite(finite(v))?`${finite(v).toFixed(finite(v)<1?2:1)} sat/vB`:"— sat/vB";
  const fmtBtc=v=>Number.isFinite(finite(v))?`${(finite(v)/1e8).toLocaleString(undefined,{maximumFractionDigits:8})} BTC`:"— BTC";
  const fmtBytes=v=>{const n=finite(v);if(!Number.isFinite(n))return "—";if(n>=1e9)return `${(n/1e9).toFixed(2)} GB`;if(n>=1e6)return `${(n/1e6).toFixed(2)} MB`;if(n>=1e3)return `${(n/1e3).toFixed(1)} kB`;return `${Math.round(n)} B`};

  function readJSON(key,fallback){try{const value=JSON.parse(localStorage.getItem(key));return value&&typeof value==="object"?value:fallback}catch(_){return fallback}}
  function writeJSON(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch(_){}}
  function download(name,data){const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=D.createElement("a");a.href=url;a.download=name;a.hidden=true;D.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  function hash32(text,seed=0){let h=(seed>>>0)^0x9e3779b9;for(const c of String(text||"")){h=Math.imul(h^c.charCodeAt(0),0x01000193);h^=h>>>13}return h>>>0}
  function seeded(seed){let n=seed>>>0;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296}}
  function base(core){try{return String(core?.widgetBase?.(ID)||`/__partials/widgets/${ID}`).replace(/\/+$/g,"")}catch(_){return`/__partials/widgets/${ID}`}}
  function url(core,path){const raw=`${base(core)}/${String(path).replace(/^\/+/,"")}`;return W.ZZXAPI?.url?W.ZZXAPI.url(raw):raw}
  async function json(source){const r=await fetch(source,{cache:"no-store",credentials:"same-origin"});if(!r.ok)throw new Error(`HTTP ${r.status}`);return await r.json()}
  function scriptOnce(src,key){
    if(W[key])return Promise.resolve(true);
    const selector=`script[data-mv-dependency="${key}"]`,prior=D.querySelector(selector);
    if(prior)return new Promise(resolve=>{prior.addEventListener("load",()=>resolve(true),{once:true});prior.addEventListener("error",()=>resolve(false),{once:true});setTimeout(()=>resolve(Boolean(W[key])),7000)});
    return new Promise(resolve=>{const s=D.createElement("script");s.src=src;s.defer=true;s.dataset.mvDependency=key;s.onload=()=>resolve(true);s.onerror=()=>resolve(false);(D.head||D.documentElement).append(s)});
  }

  function rgb(hex){const s=String(hex||"").replace("#","");return /^[0-9a-f]{6}$/i.test(s)?[parseInt(s.slice(0,2),16),parseInt(s.slice(2,4),16),parseInt(s.slice(4,6),16)]:[128,128,128]}
  function hex(c){return`#${c.map(v=>clamp(Math.round(v),0,255).toString(16).padStart(2,"0")).join("")}`}
  function mix(a,b,t){const A=rgb(a),B=rgb(b);return hex(A.map((v,i)=>v+(B[i]-v)*clamp(t,0,1)))}
  function alpha(hexColor,a){const c=rgb(hexColor);return`rgba(${c[0]},${c[1]},${c[2]},${clamp(a,0,1)})`}
  function themeScale(theme){return[theme.low,mix(theme.low,theme.mid,.5),theme.mid,mix(theme.mid,theme.high,.4),mix(theme.mid,theme.high,.75),theme.high,mix(theme.high,theme.hot,.35),mix(theme.high,theme.hot,.7),theme.hot]}

  function quantile(values,q){const a=values.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return NaN;const p=clamp(q,0,1)*(a.length-1),lo=Math.floor(p),hi=Math.ceil(p);return lo===hi?a[lo]:a[lo]+(a[hi]-a[lo])*(p-lo)}
  function txValue(raw){
    if(Array.isArray(raw?.vout)){let total=0,seen=false;for(const out of raw.vout){const n=finite(out?.value);if(Number.isFinite(n)){total+=n;seen=true}}if(seen)return total}
    for(const value of [raw?.valueSats,raw?.value,raw?.outputValueSats,raw?.output_value_sats]){const n=finite(value);if(Number.isFinite(n)&&n>=0)return n}
    const btc=finite(raw?.valueBtc??raw?.valueBTC);return Number.isFinite(btc)?btc*1e8:NaN;
  }
  function normalize(raw,index=0,source="live"){
    if(!raw||typeof raw!=="object")return null;
    const txid=String(raw.txid||raw.id||raw.hash||"").toLowerCase();if(!validTxid(txid))return null;
    const weight=finite(raw.weight),size=finite(raw.size),vsize=finite(raw.vsize??raw.vbytes??(Number.isFinite(weight)?weight/4:size));
    const feeSats=finite(raw.fee??raw.fee_sats??raw.feeSats);
    const feeRate=finite(raw.feeRate??raw.fee_rate??raw.feerate??raw.rate??(Number.isFinite(feeSats)&&vsize>0?feeSats/vsize:NaN));
    const first=finite(raw.firstSeen??raw.first_seen??raw.time);const firstSeen=Number.isFinite(first)?(first<1e11?first*1000:first):NaN;
    return {txid,id:txid,rank:finite(raw.projectedRank,index),vsize,weight,size,feeSats,feeRate,packageFeeRate:finite(raw.packageFeeRate??raw.effectiveFeeRate??raw.ancestorFeeRate,feeRate),valueSats:txValue(raw),firstSeen,rbf:typeof raw.rbf==="boolean"?raw.rbf:null,source,raw};
  }
  function mergeRows(map,rows,source){for(let i=0;i<(rows||[]).length;i++){const tx=normalize(rows[i],i,source);if(!tx)continue;const old=map.get(tx.txid);map.set(tx.txid,old?{...old,...tx,raw:{...(old.raw||{}),...(tx.raw||{})}}:tx)}}

  function demoRows(count=1024){
    const random=seeded(0xdeadbeef),rows=[];
    for(let i=0;i<count;i++){
      const parts=[];for(let j=0;j<8;j++)parts.push(Math.floor(random()*0xffffffff).toString(16).padStart(8,"0"));
      const vsize=Math.round(90+Math.pow(random(),2.2)*3800),feeRate=Math.max(.3,Math.exp(random()*5.3)-.6),feeSats=Math.round(vsize*feeRate);
      const whale=random()<.025,valueSats=Math.round(whale?(1+random()*180)*1e8:Math.pow(random(),3.1)*1.8e8+350);
      rows.push({txid:parts.join("").slice(0,64),id:parts.join("").slice(0,64),rank:i,vsize,feeSats,feeRate,packageFeeRate:feeRate*(.92+random()*.18),valueSats,firstSeen:Date.now()-random()*36e5*36,rbf:random()<.28,source:"demo",raw:{demo:true}});
    }
    return rows.sort((a,b)=>b.packageFeeRate-a.packageFeeRate).map((tx,i)=>({...tx,rank:i}));
  }

  function metric(tx,mode){if(mode==="amount")return finite(tx.valueSats);if(mode==="fee"||mode==="absoluteFee")return finite(tx.feeSats);if(mode==="feerate")return finite(tx.packageFeeRate??tx.feeRate);if(mode==="age")return Number.isFinite(tx.firstSeen)?Date.now()-tx.firstSeen:NaN;if(mode==="hash")return hash32(tx.txid);return finite(tx.vsize)}
  function sortRows(rows,mode){return rows.slice().sort((a,b)=>{
    if(mode==="fee"||mode==="spectrum")return finite(b.packageFeeRate,-1)-finite(a.packageFeeRate,-1)||finite(a.rank,1e9)-finite(b.rank,1e9);
    if(mode==="amount")return finite(b.valueSats,-1)-finite(a.valueSats,-1);
    if(mode==="age")return finite(a.firstSeen,Infinity)-finite(b.firstSeen,Infinity);
    if(mode==="hash")return hash32(a.txid)-hash32(b.txid);
    return finite(a.rank,1e9)-finite(b.rank,1e9)||finite(b.packageFeeRate,-1)-finite(a.packageFeeRate,-1);
  })}

  // A square dissection using 2x2 and 3x3 recursive partitions. Every source
  // transaction receives at least one square leaf; the few padding leaves needed
  // for arbitrary counts repeat the smallest transaction and are marked fragments.
  function representation(count){
    if(count===1)return{a:0,b:0};let best=null;
    for(let b=0;b<=Math.floor((count-1)/8);b++){const left=count-1-b*8;if(left<0||left%3)continue;const a=left/3,score=Math.abs((b/Math.max(1,a+b))-.22);if(!best||score<best.score)best={a,b,score}}
    return best&&{a:best.a,b:best.b};
  }
  function nextConstructible(n){for(let x=Math.max(1,n);x<n+24;x++)if(representation(x))return x;return n}
  function finiteWeight(row){const n=finite(row.__weight);return Number.isFinite(n)&&n>0?n:1e-12}
  function distribute(k,a,b){const bins=Array.from({length:k},()=>({a:0,b:0,count:1})),ops=[...Array.from({length:b},()=>["b",8]),...Array.from({length:a},()=>["a",3])];for(const[key,inc]of ops){let win=0;for(let i=1;i<bins.length;i++)if(bins[i].count+inc<bins[win].count+inc)win=i;bins[win][key]++;bins[win].count+=inc}return bins}
  function assign(rows,bundles){
    const source=rows.slice().sort((a,b)=>finiteWeight(b)-finiteWeight(a)),bins=bundles.map((v,i)=>({...v,index:i,rows:[],load:0,left:v.count}));
    for(const bin of bins.slice().sort((a,b)=>a.count-b.count)){const row=source.shift();if(!row)break;bin.rows.push(row);bin.load+=finiteWeight(row);bin.left--}
    const target=rows.reduce((s,v)=>s+finiteWeight(v),0)/bins.length;
    for(const row of source){let win=null,score=Infinity;for(const bin of bins){if(bin.left<=0)continue;const next=(bin.load+finiteWeight(row))/Math.max(1e-12,target)+bin.rows.length/bin.count*.04;if(next<score){score=next;win=bin}}win=win||bins.find(v=>v.left>0)||bins.at(-1);win.rows.push(row);win.load+=finiteWeight(row);win.left--}
    return bins;
  }
  function buildNode(rows,a,b,x,y,side,depth,seed,leaves){
    if(rows.length===1||(!a&&!b)){const row=rows[0];leaves.push({...row,x,y,side,depth});return}
    let grid=b>0&&(!a||(depth+seed)%5===0)?3:2;if(grid===2&&a<=0)grid=3;if(grid===3&&b<=0)grid=2;
    const bundles=assign(rows,distribute(grid*grid,a-(grid===2?1:0),b-(grid===3?1:0))).sort((u,v)=>finite(u.rows[0]?.__order,1e9)-finite(v.rows[0]?.__order,1e9));
    const cell=side/grid;for(let i=0;i<bundles.length;i++){const serpentine=(Math.floor(i/grid)+depth+(seed&1))%2;const col=serpentine?grid-1-(i%grid):i%grid,row=Math.floor(i/grid);buildNode(bundles[i].rows,bundles[i].a,bundles[i].b,x+col*cell,y+row*cell,cell,depth+1,(seed*1664525+1013904223+i)>>>0,leaves)}
  }
  function pack(rows,scaleMode,seed=0){
    if(!rows.length)return[];const values=rows.map(tx=>metric(tx,scaleMode)).filter(v=>Number.isFinite(v)&&v>=0),median=quantile(values,.5)||1,cap=Math.max(quantile(values,.995)||1,median*12),floor=Math.max(cap*1e-7,1e-12);
    const prepared=rows.map((tx,i)=>({...tx,__order:i,__weight:Math.max(floor,clamp(metric(tx,scaleMode),0,cap)||median*.08),__fragment:false})),required=nextConstructible(prepared.length),small=prepared.slice().sort((a,b)=>a.__weight-b.__weight);
    for(let i=prepared.length;i<required;i++){const original=small[(i-prepared.length)%small.length];prepared.push({...original,__fragment:true,__fragmentIndex:i-prepared.length+1,__weight:Math.max(floor,original.__weight/(required-prepared.length+1))})}
    const plan=representation(required),leaves=[];buildNode(prepared,plan.a,plan.b,0,0,1,0,seed,leaves);return leaves;
  }

  function trimDetail(tx,detail){
    const vin=(detail?.vin||[]).slice(0,24).map(v=>({txid:v.txid,vout:v.vout,sequence:v.sequence,is_coinbase:v.is_coinbase,prevout:v.prevout?{value:v.prevout.value,scriptpubkey_address:v.prevout.scriptpubkey_address,scriptpubkey_type:v.prevout.scriptpubkey_type}:null}));
    const vout=(detail?.vout||[]).slice(0,24).map(v=>({value:v.value,scriptpubkey_address:v.scriptpubkey_address,scriptpubkey_type:v.scriptpubkey_type}));
    return {txid:tx.txid,vsize:finite(detail?.vsize,tx.vsize),weight:finite(detail?.weight,tx.weight),size:finite(detail?.size,tx.size),feeSats:finite(detail?.fee,tx.feeSats),feeRate:finite(detail?.feeRate,tx.feeRate),valueSats:txValue(detail)||tx.valueSats,firstSeen:tx.firstSeen,rbf:detail?.status?null:tx.rbf,status:detail?.status||null,vin,vout,source:tx.source,selectedAt:Date.now(),demo:Boolean(detail?.demo||tx.raw?.demo)};
  }

  async function mount(root,core){
    if(!root||root.__mvMounted)return;root.__mvMounted=true;
    const aborter=typeof AbortController==="function"?new AbortController():null,opts=aborter?{signal:aborter.signal}:undefined;
    let destroyed=false,visible=false,active=false,paused=false,frame=0,lastFrame=0,lastPaint=0,resizeObserver=null,intersection=null,unsubscribe=null,demoTimer=0,refreshTimer=0;
    let themes=[],presets=[],macros=[],settings={...DEFAULTS,...readJSON(STORAGE,{})},theme=null,rows=new Map(),displayRows=[],leaves=[],particles=[],particleMap=new Map(),ranges={},sourceState="loading",sourceLabel="CONNECTING",tipHeight=NaN,mempoolInfo=null,blocks=[],priceUsd=NaN,selectedTxid="",hoverTxid="",burstAt=0,layoutDirty=true;
    const stage=root.querySelector("[data-mv-stage]"),canvas=root.querySelector("[data-mv-canvas]"),ctx=canvas?.getContext("2d",{alpha:false,desynchronized:true}),tooltip=root.querySelector("[data-mv-tooltip]");
    const pointer={x:0,y:0,inside:false,down:false};
    if(!stage||!canvas||!ctx)throw new Error("Mempool Visualizer canvas markup is incomplete");

    function sanitize(){
      settings.budget=clamp(Number(settings.budget)||1024,128,4096);settings.fps=clamp(Number(settings.fps)||45,10,60);
      for(const key of ["force","damping","trails","glow"])settings[key]=clamp(Number(settings[key])||0,0,key==="damping"?98:100);
      settings.gap=clamp(Number(settings.gap)||0,0,2);for(const key of ["cursorGravity","labels","reducedMotion","demoFallback"])settings[key]=Boolean(settings[key]);
      if(!CHOICES.physics[settings.physics])settings.physics=DEFAULTS.physics;if(!CHOICES.scale[settings.scale])settings.scale=DEFAULTS.scale;if(!CHOICES.color[settings.color])settings.color=DEFAULTS.color;if(!CHOICES.topology[settings.topology])settings.topology=DEFAULTS.topology;
    }
    sanitize();
    function persist(){writeJSON(STORAGE,settings)}
    function applyTheme(){theme=themes.find(t=>t.id===settings.theme)||themes[0];if(!theme)return;settings.theme=theme.id;root.dataset.mvTheme=theme.id;for(const[key,value]of Object.entries({bg:theme.bg,panel:theme.panel,primary:theme.primary,accent:theme.accent,text:mix(theme.primary,"#ffffff",.64),muted:mix(theme.primary,"#606860",.62),border:alpha(mix(theme.primary,theme.accent,.5),.28),grid:alpha(theme.primary,.06)}))root.style.setProperty(`--mv-${key}`,value);renderLegend()}
    function setConnection(kind,label){sourceState=kind;sourceLabel=label;const node=root.querySelector("[data-mv-connection]");if(node){node.dataset.state=kind;node.textContent=label}}
    function fillSelect(node,items,value){if(!node)return;node.replaceChildren();for(const item of items){const o=D.createElement("option");o.value=String(item.id);o.textContent=item.name;node.append(o)}node.value=String(value)}
    function populate(){
      const themeSelect=root.querySelector('[data-mv-control="theme"]');if(themeSelect){themeSelect.replaceChildren();const groups=new Map();for(const t of themes){if(!groups.has(t.group))groups.set(t.group,[]);groups.get(t.group).push(t)}for(const[name,list]of groups){const g=D.createElement("optgroup");g.label=name;for(const t of list){const o=D.createElement("option");o.value=t.id;o.textContent=t.name;g.append(o)}themeSelect.append(g)}themeSelect.value=settings.theme}
      fillSelect(root.querySelector("[data-mv-preset]"),presets,settings.preset);
      for(const key of ["physics","scale","color","topology","budget","fps"]){fillSelect(root.querySelector(`[data-mv-control="${key}"]`),Object.entries(CHOICES[key]).map(([id,name])=>({id,name})),settings[key])}
      const host=root.querySelector("[data-mv-macros]");if(host){host.replaceChildren();for(const macro of macros){const b=D.createElement("button");b.type="button";b.className="mv-icon-btn";b.dataset.mvMacro=macro.id;b.textContent=macro.name;host.append(b)}}
      syncControls();
    }
    function syncControls(){for(const[key,value]of Object.entries(settings)){const n=root.querySelector(`[data-mv-control="${key}"]`);if(n){if(n.type==="checkbox")n.checked=Boolean(value);else n.value=String(value)}}for(const key of ["force","damping","trails","glow"]){const n=root.querySelector(`[data-mv-output="${key}"]`);if(n)n.textContent=`${settings[key]}%`}const gap=root.querySelector('[data-mv-output="gap"]');if(gap)gap.textContent=`${settings.gap}px`;const ps=root.querySelector("[data-mv-preset]");if(ps&&presets.some(p=>p.id===settings.preset))ps.value=settings.preset}
    function renderLegend(){const host=root.querySelector("[data-mv-legend]");if(!host||!theme)return;const colors=themeScale(theme),labels=settings.color==="fee"?["0","1","2","5","10","25","50","100","250+"]:settings.color==="age"?["new","5m","15m","1h","3h","6h","12h","1d","old"]:["min","","p25","","median","","p75","","max"];host.replaceChildren();colors.forEach((color,i)=>{const box=D.createElement("span"),sw=D.createElement("i"),label=D.createElement("b");sw.style.background=color;sw.style.color=color;label.textContent=labels[i];box.append(sw,label);host.append(box)})}
    function applyPreset(id){const preset=presets.find(p=>p.id===id);if(!preset)return;settings={...settings,...preset,preset:id};sanitize();applyTheme();syncControls();persist();layoutDirty=true;setFieldLabel();startLoop()}
    function macroString(){return`theme:${settings.theme} physics:${settings.physics} scale:${settings.scale} color:${settings.color} topology:${settings.topology} budget:${settings.budget} fps:${settings.fps} force:${settings.force} damping:${settings.damping} trails:${settings.trails} glow:${settings.glow} gap:${settings.gap}`}
    function runMacro(source){
      const aliases={value:"amount",fees:"fee",size:"vsize",calm:"tide",still:"settle"},allowed=new Set(["theme","physics","scale","color","topology","budget","fps","force","damping","trails","glow","gap"]),next={...settings};
      for(const token of String(source||"").trim().split(/\s+/)){const i=token.indexOf(":");if(i<1)continue;const key=token.slice(0,i),raw=token.slice(i+1);if(!allowed.has(key))continue;next[key]=aliases[raw]||(/^-?\d+(\.\d+)?$/.test(raw)?Number(raw):raw)}settings=next;sanitize();applyTheme();syncControls();persist();layoutDirty=true;setFieldLabel();startLoop();
    }

    function makeRanges(){ranges={};for(const mode of ["amount","fee","absoluteFee","vsize","feerate","age"]){const values=displayRows.map(tx=>metric(tx,mode)).filter(Number.isFinite);ranges[mode]={lo:quantile(values,.02)||0,hi:Math.max(quantile(values,.98)||1,1)}}}
    function normalized(tx,mode){if(mode==="hash")return(hash32(tx.txid)%10000)/9999;const range=ranges[mode]||{lo:0,hi:1},value=metric(tx,mode);if(!Number.isFinite(value))return 0;const log=mode!=="age";return log?clamp((Math.log1p(Math.max(0,value))-Math.log1p(Math.max(0,range.lo)))/Math.max(1e-9,Math.log1p(range.hi)-Math.log1p(Math.max(0,range.lo))),0,1):clamp((value-range.lo)/Math.max(1e-9,range.hi-range.lo),0,1)}
    function colorFor(tx){if(!theme)return"#777";const t=normalized(tx,settings.color),scale=themeScale(theme),pos=t*(scale.length-1),i=Math.floor(pos);return mix(scale[i],scale[Math.min(scale.length-1,i+1)],pos-i)}
    function rebuild(){
      layoutDirty=false;const all=sortRows([...rows.values()],settings.topology),budget=Math.min(settings.budget,all.length);displayRows=all.slice(0,budget);if(!displayRows.length){leaves=[];particles=[];particleMap.clear();renderStats();return}
      makeRanges();let candidate=[],reserve=[],used=0;for(const tx of displayRows){if(used<1e6&&candidate.length<Math.ceil(displayRows.length*.62)){candidate.push(tx);used+=Number.isFinite(tx.vsize)?tx.vsize:250}else reserve.push(tx)}
      if(!reserve.length&&candidate.length>1){const cut=Math.ceil(candidate.length*.62);reserve=candidate.splice(cut)}if(!candidate.length)candidate=reserve.splice(0,1);if(!reserve.length)reserve=candidate.slice(-1);
      const packed=[pack(candidate,settings.scale,0x5a585831),pack(reserve,settings.scale,0x5a585832)];leaves=[];
      for(let chamber=0;chamber<2;chamber++)for(let i=0;i<packed[chamber].length;i++){const leaf=packed[chamber][i];leaves.push({...leaf,chamber,key:`${chamber}:${leaf.txid}:${leaf.__fragment?leaf.__fragmentIndex||i:0}`,color:colorFor(leaf)})}
      const nextMap=new Map();for(const leaf of leaves){let p=particleMap.get(leaf.key);if(!p){const r=seeded(hash32(leaf.key));p={key:leaf.key,x:r(),y:r(),s:.01,vx:0,vy:0,vs:0,phase:r()*Math.PI*2}}Object.assign(p,{leaf,color:leaf.color});nextMap.set(leaf.key,p)}particleMap=nextMap;particles=[...nextMap.values()];renderStats();setFieldLabel();
    }
    function setFieldLabel(){const preset=presets.find(p=>p.id===settings.preset);const label=root.querySelector("[data-mv-field-label]");if(label)label.textContent=`${(preset?.name||"CUSTOM").toUpperCase()} · ${CHOICES.color[settings.color].toUpperCase()} × ${CHOICES.scale[settings.scale].toUpperCase()}`}

    function geometry(){const rect=stage.getBoundingClientRect(),w=Math.max(1,rect.width),h=Math.max(1,rect.height),side=Math.min(h,w/2),left=(w-side*2)/2,top=(h-side)/2;return{w,h,side,left,top,dpr:clamp(W.devicePixelRatio||1,1,2)}}
    function resize(){const g=geometry(),pw=Math.max(1,Math.round(g.w*g.dpr)),ph=Math.max(1,Math.round(g.h*g.dpr));if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph;layoutDirty=true}return g}
    function targetFor(p,g){const l=p.leaf;return{x:g.left+l.chamber*g.side+l.x*g.side,y:g.top+l.y*g.side,s:l.side*g.side,chamber:l.chamber}}
    function modeOffset(p,t,g,target){
      if(settings.reducedMotion||settings.physics==="settle")return{x:0,y:0,scale:1};const force=settings.force/100,amp=Math.min(target.s*.28,g.side*.014)*(0.25+force*1.4),phase=p.phase;
      if(settings.physics==="tide")return{x:Math.cos(t*.00023+phase)*amp*.32,y:Math.sin(t*.00042+phase+target.x/g.side)*amp,scale:1+Math.sin(t*.00035+phase)*.008*force};
      if(settings.physics==="drift")return{x:(Math.sin(t*.00031+phase)+Math.sin(t*.00013+phase*2))*amp*.55,y:(Math.cos(t*.00027+phase)+Math.sin(t*.00017+phase))*amp*.55,scale:1};
      if(settings.physics==="orbit"){const cx=g.left+(target.chamber+.5)*g.side,cy=g.top+g.side/2,dx=target.x+target.s/2-cx,dy=target.y+target.s/2-cy,a=Math.sin(t*.0002+phase)*.018*force;return{x:dx*Math.cos(a)-dy*Math.sin(a)-dx,y:dx*Math.sin(a)+dy*Math.cos(a)-dy,scale:1}}
      if(settings.physics==="breathe")return{x:0,y:0,scale:1+Math.sin(t*.00032+phase*.22)*.025*force};
      if(settings.physics==="storm")return{x:(Math.sin(t*.0014+phase*7)+Math.cos(t*.0008+phase))*amp*1.7,y:(Math.cos(t*.0011+phase*5)+Math.sin(t*.0017+phase))*amp*1.7,scale:1+Math.sin(t*.002+phase)*.025};
      return{x:Math.cos(t*.00045+phase)*amp*.3,y:Math.sin(t*.00038+phase)*amp*.3,scale:1};
    }
    function physics(p,t,g,target){
      const offset=modeOffset(p,t,g,target),desiredX=target.x+offset.x,desiredY=target.y+offset.y,desiredS=target.s*offset.scale,spring=settings.reducedMotion?1:.055+settings.force*.00045,damp=settings.reducedMotion?0:settings.damping/100;
      p.vx=(p.vx+(desiredX-p.x)*spring)*damp;p.vy=(p.vy+(desiredY-p.y)*spring)*damp;p.vs=(p.vs+(desiredS-p.s)*spring)*damp;
      if(pointer.inside&&settings.cursorGravity&&!settings.reducedMotion){const cx=p.x+p.s/2,cy=p.y+p.s/2,dx=pointer.x-cx,dy=pointer.y-cy,dist=Math.max(12,Math.hypot(dx,dy)),reach=g.side*.34;if(dist<reach){const pull=(1-dist/reach)*(settings.force/100)*.42;p.vx+=dx/dist*pull;p.vy+=dy/dist*pull}}
      if(burstAt&&t-burstAt<1700&&!settings.reducedMotion){const age=(t-burstAt)/1700,cx=g.left+(target.chamber+.5)*g.side,cy=g.top+g.side/2,dx=p.x-cx,dy=p.y-cy,dist=Math.max(1,Math.hypot(dx,dy)),wave=Math.max(0,1-Math.abs(dist/g.side-age)*8);p.vx+=dx/dist*wave*.65;p.vy+=dy/dist*wave*.65}
      p.x+=p.vx;p.y+=p.vy;p.s=Math.max(.6,p.s+p.vs);
    }
    function square(context,x,y,s,color,a=1){if(s<.18)return;context.globalAlpha=a;context.fillStyle=color;context.fillRect(x,y,s+.65,s+.65)}
    function draw(t){
      const g=resize();if(layoutDirty)rebuild();ctx.setTransform(g.dpr,0,0,g.dpr,0,0);ctx.globalCompositeOperation="source-over";ctx.globalAlpha=1;ctx.fillStyle=theme?.bg||"#020302";ctx.fillRect(0,0,g.w,g.h);
      // Permanent base atlas makes both square chambers gapless even while the physical overlay moves.
      for(const leaf of leaves){const x=g.left+leaf.chamber*g.side+leaf.x*g.side,y=g.top+leaf.y*g.side,s=leaf.side*g.side;square(ctx,x,y,s,leaf.color,1)}
      ctx.fillStyle=alpha(theme?.accent||"#fff",.55);ctx.fillRect(g.left+g.side-.5,g.top,1,g.side);
      const gap=settings.gap,trail=settings.trails/100,glow=settings.glow/100;ctx.globalCompositeOperation=glow>.02?"screen":"source-over";
      for(const p of particles){const target=targetFor(p,g);if(!paused)physics(p,t,g,target);const size=Math.max(.4,p.s-gap),selected=p.leaf.txid===selectedTxid,hover=p.leaf.txid===hoverTxid;
        if(trail>.02&&!settings.reducedMotion){square(ctx,p.x-p.vx*5+gap/2,p.y-p.vy*5+gap/2,size,p.color,.08+trail*.14);square(ctx,p.x-p.vx*2.5+gap/2,p.y-p.vy*2.5+gap/2,size,p.color,.1+trail*.16)}
        if(glow>.02&&size>2){ctx.shadowColor=p.color;ctx.shadowBlur=Math.min(16,size*.28)*glow}else ctx.shadowBlur=0;
        square(ctx,p.x+gap/2,p.y+gap/2,size,p.color,.42+glow*.28);ctx.shadowBlur=0;
        if(selected||hover){ctx.globalCompositeOperation="source-over";ctx.globalAlpha=1;ctx.strokeStyle=selected?(theme?.hot||"#fff"):(theme?.accent||"#fff");ctx.lineWidth=selected?2:1;ctx.strokeRect(p.x+1,p.y+1,Math.max(1,p.s-2),Math.max(1,p.s-2));ctx.globalCompositeOperation=glow>.02?"screen":"source-over"}
        if(settings.labels&&size>42&&!p.leaf.__fragment){ctx.globalCompositeOperation="source-over";ctx.globalAlpha=.9;ctx.fillStyle=theme?.text||"#fff";ctx.font=`${clamp(size*.13,7,11)}px IBM Plex Mono, monospace`;ctx.fillText(settings.scale==="amount"?fmtBtc(p.leaf.valueSats):fmtRate(p.leaf.packageFeeRate),p.x+4,p.y+clamp(size*.18,10,14),size-8);ctx.globalCompositeOperation=glow>.02?"screen":"source-over"}
      }
      ctx.globalAlpha=1;ctx.globalCompositeOperation="source-over";
    }
    function loop(t){if(destroyed||!active)return;const interval=1000/settings.fps;if(t-lastPaint>=interval){draw(t);lastPaint=t}frame=W.requestAnimationFrame(loop)}
    function startLoop(){if(destroyed||!visible||paused)return;active=true;if(!frame)frame=W.requestAnimationFrame(loop)}
    function stopLoop(){active=false;if(frame){W.cancelAnimationFrame(frame);frame=0}}

    function currentAt(x,y){for(let i=particles.length-1;i>=0;i--){const p=particles[i];if(x>=p.x&&x<=p.x+p.s&&y>=p.y&&y<=p.y+p.s)return p.leaf}return null}
    function showTip(event,tx){if(!tooltip||!tx){if(tooltip)tooltip.hidden=true;return}tooltip.replaceChildren();const strong=D.createElement("strong"),line=D.createElement("span");strong.textContent=`${tx.txid.slice(0,18)}…${tx.txid.slice(-10)}`;line.textContent=`${fmtBtc(tx.valueSats)} · ${fmtRate(tx.packageFeeRate)} · ${fmtInt(tx.vsize)} vB · ${fmtInt(tx.feeSats)} sat fee`;tooltip.append(strong,line);tooltip.hidden=false;const sr=stage.getBoundingClientRect(),w=tooltip.offsetWidth||320,h=tooltip.offsetHeight||54;tooltip.style.left=`${clamp(event.clientX-sr.left+12,6,sr.width-w-6)}px`;tooltip.style.top=`${clamp(event.clientY-sr.top+12,6,sr.height-h-6)}px`}
    function pointerMove(event){const r=stage.getBoundingClientRect();pointer.x=event.clientX-r.left;pointer.y=event.clientY-r.top;pointer.inside=true;stage.style.setProperty("--mv-pointer-x",`${pointer.x}px`);stage.style.setProperty("--mv-pointer-y",`${pointer.y}px`);const tx=currentAt(pointer.x,pointer.y);hoverTxid=tx?.txid||"";showTip(event,tx)}
    function ripple(x,y){for(const p of particles){const dx=p.x+p.s/2-x,dy=p.y+p.s/2-y,dist=Math.max(8,Math.hypot(dx,dy));if(dist<220){const push=(1-dist/220)*2.2*(settings.force/100+.25);p.vx+=dx/dist*push;p.vy+=dy/dist*push}}}

    function pinList(){return readJSON(PINS,[]).filter(v=>v&&validTxid(v.txid)).slice(0,16)}
    function savePin(record){const list=pinList().filter(v=>v.txid!==record.txid);list.unshift(record);writeJSON(PINS,list.slice(0,16));renderPins()}
    function findTx(txid){return rows.get(txid)||displayRows.find(v=>v.txid===txid)||pinList().find(v=>v.txid===txid)||null}
    function apiBases(){if(W.ZZXMempoolLive?.apiBases)return W.ZZXMempoolLive.apiBases(core);return[core?.ctx?.api?.MEMPOOL||"/bitcoin/mempool/api","https://mempool.space/api"].filter(Boolean)}
    async function fetchDetail(tx){if(tx.raw?.demo)return trimDetail(tx,{demo:true});for(const b of apiBases()){try{const endpoint=`${String(b).replace(/\/+$/g,"")}/tx/${tx.txid}`,data=W.ZZXMempoolLive?.json?await W.ZZXMempoolLive.json(endpoint,{local:!/^https?:/i.test(endpoint),timeoutMs:10000}):await json(endpoint);return trimDetail(tx,data)}catch(_){}}return trimDetail(tx,tx.raw||{})}
    function readerMetrics(record){return[["AMOUNT",fmtBtc(record.valueSats)],["FEE",`${fmtInt(record.feeSats)} sat`],["FEE RATE",fmtRate(record.feeRate??(record.feeSats/record.vsize))],["VIRTUAL SIZE",`${fmtInt(record.vsize)} vB`],["WEIGHT",`${fmtInt(record.weight)} WU`],["I / O",`${record.vin?.length??"—"} / ${record.vout?.length??"—"}`]]}
    function detailLines(rowsList,kind){return(rowsList||[]).slice(0,12).map((v,i)=>kind==="in"?`${i+1}. ${String(v.txid||"coinbase").slice(0,14)}…:${v.vout??"—"}  ${fmtInt(v.prevout?.value)} sat  ${v.prevout?.scriptpubkey_type||""}`:`${i}. ${fmtInt(v.value)} sat  ${v.scriptpubkey_type||""}  ${v.scriptpubkey_address||""}`).join("\n")||"Detail not available from the active summary feed."}
    function renderReader(record){const panel=root.querySelector("[data-mv-reader]");if(!panel||!record)return;panel.hidden=false;selectedTxid=record.txid;const title=root.querySelector("[data-mv-reader-title]");if(title)title.textContent=record.txid;const host=root.querySelector("[data-mv-reader-metrics]");if(host){host.replaceChildren();for(const[label,value]of readerMetrics(record)){const d=D.createElement("div"),s=D.createElement("span"),b=D.createElement("strong");s.textContent=label;b.textContent=value;d.append(s,b);host.append(d)}}const detail=root.querySelector("[data-mv-reader-detail]");if(detail){detail.replaceChildren();const a=D.createElement("pre"),b=D.createElement("pre");a.textContent=`INPUTS\n${detailLines(record.vin,"in")}`;b.textContent=`OUTPUTS\n${detailLines(record.vout,"out")}`;detail.append(a,b)}const link=root.querySelector("[data-mv-reader-open]");if(link)link.href=`https://mempool.space/tx/${record.txid}`;renderPins()}
    function renderPins(){const host=root.querySelector("[data-mv-pins]");if(!host)return;host.replaceChildren();for(const pin of pinList()){const b=D.createElement("button");b.type="button";b.className=`mv-pin${pin.txid===selectedTxid?" is-active":""}`;b.dataset.mvPin=pin.txid;b.textContent=`${pin.txid.slice(0,10)}… · ${fmtRate(pin.feeRate)}`;host.append(b)}}
    async function selectTx(tx){if(!tx)return;selectedTxid=tx.txid;const existing=pinList().find(v=>v.txid===tx.txid);if(existing){renderReader(existing);return}const provisional=trimDetail(tx,tx.raw||{});renderReader(provisional);const record=await fetchDetail(tx);if(destroyed||selectedTxid!==tx.txid)return;savePin(record);renderReader(record)}

    function stat(key,value){const n=root.querySelector(`[data-mv-stat="${key}"]`);if(n)n.textContent=value}
    function renderStats(){
      const all=[...rows.values()],fees=displayRows.map(v=>finite(v.packageFeeRate??v.feeRate)).filter(Number.isFinite),totalValue=displayRows.reduce((s,v)=>s+(finite(v.valueSats,0)||0),0),totalFees=displayRows.reduce((s,v)=>s+(finite(v.feeSats,0)||0),0),mempoolCount=finite(mempoolInfo?.count??mempoolInfo?.size,all.length),vsize=finite(mempoolInfo?.vsize,displayRows.reduce((s,v)=>s+finite(v.vsize,0),0)),usage=finite(mempoolInfo?.usage),first=blocks[0]||{},blockSize=finite(first.blockVSize??first.block_vsize??first.blockSize),projected=finite(first.nTx??first.n_tx);
      stat("shown",fmtInt(displayRows.length));stat("total",`${fmtInt(mempoolCount)} total`);stat("vsize",fmtBytes(vsize));stat("usage",`${fmtBytes(usage)} memory`);stat("medianFee",fmtRate(quantile(fees,.5)));stat("feeRange",`${fmtRate(quantile(fees,.1))}—${fmtRate(quantile(fees,.9))}`);stat("value",fmtBtc(totalValue));stat("fees",`${fmtBtc(totalFees)} fees`);stat("block",Number.isFinite(tipHeight)?`#${fmtInt(tipHeight+1)}`:"NEXT");stat("fill",Number.isFinite(blockSize)?`${(blockSize/1e6*100).toFixed(1)}% · ${fmtInt(projected)} tx`:"projection pending");const calm=clamp(100-settings.force*.55-settings.trails*.18+(settings.damping-40)*.45,0,100);stat("tranquility",`${calm.toFixed(0)}%`);stat("motion",CHOICES.physics[settings.physics]);const source=root.querySelector("[data-mv-source]");if(source)source.textContent=`DATA SOURCE · ${sourceLabel}`;const updated=root.querySelector("[data-mv-updated]");if(updated)updated.textContent=`UPDATED ${new Date().toLocaleTimeString()}`;
    }

    function useDemo(reason="OFFLINE DEMONSTRATION"){
      if(!settings.demoFallback||[...rows.values()].some(v=>v.source!=="demo"))return;rows.clear();for(const tx of demoRows(Math.min(settings.budget,1536)))rows.set(tx.txid,tx);setConnection("demo","DEMO FIELD");sourceLabel=reason;layoutDirty=true;renderStats();startLoop();
    }
    function ingest(view){
      const snap=view?.snapshot||view||{},priorTip=tipHeight;tipHeight=finite(snap.tipHeight,tipHeight);mempoolInfo=snap.mempool||mempoolInfo;blocks=Array.isArray(snap.blocks)?snap.blocks:blocks;priceUsd=finite(snap.priceUsd,priceUsd);
      const liveRows=Array.isArray(snap.transactions)?snap.transactions:[];if(liveRows.length){if([...rows.values()].some(v=>v.source==="demo"))rows.clear();mergeRows(rows,liveRows,"live");setConnection(view?.connected||view?.transport==="websocket"?"live":"rest",view?.connected?"LIVE WS":"LIVE REST");sourceLabel=String(view?.source||snap.base||"MEMPOOL FEED").replace(/^https?:\/\//,"").slice(0,52)}else if(view){setConnection("rest","SUMMARY REST");sourceLabel=String(view?.source||"MEMPOOL SUMMARY").replace(/^https?:\/\//,"").slice(0,52)}
      if(Number.isFinite(priorTip)&&Number.isFinite(tipHeight)&&tipHeight!==priorTip)burstAt=performance.now();layoutDirty=true;renderStats();startLoop();
    }
    async function loadRecent(){for(const b of apiBases()){try{const endpoint=`${String(b).replace(/\/+$/g,"")}/mempool/recent`,data=W.ZZXMempoolLive?.json?await W.ZZXMempoolLive.json(endpoint,{local:!/^https?:/i.test(endpoint),timeoutMs:8000}):await json(endpoint);if(Array.isArray(data)&&data.length){if([...rows.values()].some(v=>v.source==="demo"))rows.clear();mergeRows(rows,data,"rest");setConnection("rest","REST SAMPLE");sourceLabel=String(b).replace(/^https?:\/\//,"").slice(0,52);layoutDirty=true;return true}}catch(_){}}return false}
    async function refresh(force=false){if(!visible&&!force)return;setConnection(sourceState==="live"?"live":"loading",sourceState==="live"?"LIVE WS":"SYNCING");try{if(W.ZZXMempoolLive){const view=await W.ZZXMempoolLive.load(core,force);ingest(view)}if(rows.size<20)await loadRecent()}catch(_){}clearTimeout(demoTimer);if(rows.size<20)demoTimer=setTimeout(()=>useDemo("OFFLINE / SUMMARY-ONLY DEMONSTRATION"),2200);renderStats()}
    function activate(){if(active)return;visible=true;startLoop();if(W.ZZXMempoolLive&&!unsubscribe)unsubscribe=W.ZZXMempoolLive.subscribe(core,ingest,{immediate:true});refresh(false);clearInterval(refreshTimer);refreshTimer=setInterval(()=>refresh(false),15000)}
    function deactivate(){visible=false;stopLoop();clearInterval(refreshTimer);refreshTimer=0;if(unsubscribe){unsubscribe();unsubscribe=null}}

    root.addEventListener("click",event=>{
      const preset=event.target.closest("[data-mv-macro]")?.dataset.mvMacro;if(preset){const macro=macros.find(m=>m.id===preset);if(macro)applyPreset(macro.preset);return}
      if(event.target.closest("[data-mv-settings]")){const panel=root.querySelector("[data-mv-settings-panel]"),button=root.querySelector("[data-mv-settings]");panel.hidden=!panel.hidden;button.setAttribute("aria-expanded",String(!panel.hidden));return}
      if(event.target.closest("[data-mv-pause]")){paused=!paused;root.classList.toggle("is-paused",paused);const b=root.querySelector("[data-mv-pause]");b.textContent=paused?"PLAY":"PAUSE";b.setAttribute("aria-pressed",String(paused));if(!paused)startLoop();else{stopLoop();draw(performance.now())}return}
      if(event.target.closest("[data-mv-fullscreen]")){const on=!root.classList.contains("is-fullscreen");root.classList.toggle("is-fullscreen",on);D.body.classList.toggle("mv-fullscreen-lock",on);const b=root.querySelector("[data-mv-fullscreen]");b.textContent=on?"COLLAPSE":"EXPAND";b.setAttribute("aria-pressed",String(on));setTimeout(()=>{layoutDirty=true;draw(performance.now())},80);return}
      if(event.target.closest("[data-mv-refresh]")){refresh(true);return}
      if(event.target.closest("[data-mv-command-run]")){runMacro(root.querySelector("[data-mv-command]")?.value);return}
      if(event.target.closest("[data-mv-copy-macro]")){navigator.clipboard?.writeText(macroString());return}
      if(event.target.closest("[data-mv-export]")){download(`mempool-visualizer-settings-${new Date().toISOString().slice(0,10)}.json`,{schema:"zzx-mempool-visualizer-settings-v1",settings,macro:macroString()});return}
      if(event.target.closest("[data-mv-reset]")){settings={...DEFAULTS};applyTheme();syncControls();persist();layoutDirty=true;startLoop();return}
      if(event.target.closest("[data-mv-reader-copy]")){if(selectedTxid)navigator.clipboard?.writeText(selectedTxid);return}
      if(event.target.closest("[data-mv-reader-close]")){root.querySelector("[data-mv-reader]").hidden=true;selectedTxid="";return}
      const pin=event.target.closest("[data-mv-pin]")?.dataset.mvPin;if(pin){const record=pinList().find(v=>v.txid===pin);if(record)renderReader(record)}
    },opts);
    root.addEventListener("change",event=>{const key=event.target.dataset.mvControl;if(key){settings.preset="custom";settings[key]=event.target.type==="checkbox"?event.target.checked:(key==="budget"||key==="fps"?Number(event.target.value):event.target.value);sanitize();if(key==="theme")applyTheme();syncControls();persist();layoutDirty=true;setFieldLabel();startLoop()}if(event.target.matches("[data-mv-preset]"))applyPreset(event.target.value)},opts);
    root.addEventListener("input",event=>{const key=event.target.dataset.mvControl;if(!["force","damping","trails","glow","gap"].includes(key))return;settings.preset="custom";settings[key]=Number(event.target.value);sanitize();syncControls();persist();startLoop()},opts);
    root.querySelector("[data-mv-command]")?.addEventListener("keydown",event=>{if(event.key==="Enter")runMacro(event.currentTarget.value)},opts);
    root.querySelector("[data-mv-import]")?.addEventListener("change",async event=>{const file=event.target.files?.[0];if(!file)return;try{const data=JSON.parse(await file.text()),incoming=data.settings||data;if(incoming&&typeof incoming==="object"){settings={...settings,...incoming,preset:"custom"};sanitize();applyTheme();syncControls();persist();layoutDirty=true;startLoop()}}catch(_){setConnection("error","INVALID SETTINGS")}event.target.value=""},opts);
    stage.addEventListener("pointermove",pointerMove,opts);stage.addEventListener("pointerleave",()=>{pointer.inside=false;hoverTxid="";if(tooltip)tooltip.hidden=true},opts);stage.addEventListener("pointerdown",event=>{pointerMove(event);ripple(pointer.x,pointer.y);const tx=currentAt(pointer.x,pointer.y);if(tx)selectTx(tx)},opts);
    D.addEventListener("keydown",event=>{if(event.key==="Escape"&&root.classList.contains("is-fullscreen")){root.classList.remove("is-fullscreen");D.body.classList.remove("mv-fullscreen-lock");const b=root.querySelector("[data-mv-fullscreen]");if(b){b.textContent="EXPAND";b.setAttribute("aria-pressed","false")}}},opts);
    D.addEventListener("visibilitychange",()=>{if(D.hidden)stopLoop();else if(visible)startLoop()},opts);

    try{const assets=await Promise.all([json(url(core,"themes.json")),json(url(core,"presets.json"))]);themes=assets[0].themes||[];presets=assets[1].presets||[];macros=assets[1].macros||[]}catch(error){throw new Error(`Visualizer catalog unavailable: ${error.message}`)}
    if(!themes.length||!presets.length)throw new Error("Visualizer catalogs are empty");applyTheme();populate();renderPins();setFieldLabel();
    const shared=W.ZZXMempoolLive||await scriptOnce(W.ZZXAPI?.url?W.ZZXAPI.url("/__partials/widgets/_shared/zzx-mempool-live.js"):"/__partials/widgets/_shared/zzx-mempool-live.js","ZZXMempoolLive");
    if(!shared&&!W.ZZXMempoolLive)setConnection("error","FEED MODULE ERROR");
    if("ResizeObserver"in W){resizeObserver=new ResizeObserver(()=>{layoutDirty=true;if(!active)draw(performance.now())});resizeObserver.observe(stage)}
    if("IntersectionObserver"in W){intersection=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.target!==root)continue;if(entry.isIntersecting)activate();else deactivate()}},{rootMargin:"500px 0px 500px 0px",threshold:.01});intersection.observe(root)}else activate();
    root.__mvDestroy=()=>{destroyed=true;deactivate();clearTimeout(demoTimer);resizeObserver?.disconnect();intersection?.disconnect();aborter?.abort();root.__mvMounted=false};
  }

  async function boot(root,core){try{await mount(root,core||W.ZZXWidgetsCore||W.ZZXWidgets||{})}catch(error){console.error("[mempool-visualizer]",error);const status=root?.querySelector?.("[data-mv-connection]");if(status){status.dataset.state="error";status.textContent="INITIALIZATION ERROR";status.title=String(error?.message||error)}throw error}}
  function fallback(){const run=()=>D.querySelectorAll('[data-widget-root="mempool-visualizer"]').forEach(root=>boot(root,W.ZZXWidgetsCore));if(D.readyState==="loading")D.addEventListener("DOMContentLoaded",run,{once:true});else run()}
  if(W.ZZXAPI?.register)W.ZZXAPI.register(ID,boot);else if(W.ZZXWidgetsCore?.onMount)W.ZZXWidgetsCore.onMount(ID,boot);else if(W.ZZXWidgets?.register)W.ZZXWidgets.register(ID,boot);else fallback();
})();

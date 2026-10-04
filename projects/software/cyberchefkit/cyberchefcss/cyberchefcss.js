(()=>{"use strict";const $=id=>document.getElementById(id),state={css:""};
const ids=["bg","surface","surface2","text","muted","primary","accent","danger","line","radius","space","font-size"];
const presets={
zzx:{bg:"#121212",surface:"#181818",surface2:"#202020",text:"#e8e8e8",muted:"#969696",primary:"#c0d674",accent:"#e6a42b",danger:"#e06c75",line:"#343434",radius:8,space:8,"font-size":14},
terminal:{bg:"#050805",surface:"#091109",surface2:"#0d170d",text:"#d9ffd9",muted:"#7ca17c",primary:"#70ff70",accent:"#d6d66f",danger:"#ff7272",line:"#244224",radius:2,space:7,"font-size":14},
paper:{bg:"#f4f1e8",surface:"#ffffff",surface2:"#ece8dc",text:"#202020",muted:"#666666",primary:"#365c36",accent:"#8a5a13",danger:"#8d3232",line:"#c9c3b4",radius:6,space:8,"font-size":14}
};
function vals(){return Object.fromEntries(ids.map(id=>[id,$(id).type==="number"?+$(id).value:$(id).value]))}
function buildCSS(){
 const v=vals();
 state.css=`:root {
  --cc-bg: ${v.bg};
  --cc-surface: ${v.surface};
  --cc-surface-2: ${v.surface2};
  --cc-text: ${v.text};
  --cc-muted: ${v.muted};
  --cc-primary: ${v.primary};
  --cc-accent: ${v.accent};
  --cc-danger: ${v.danger};
  --cc-line: ${v.line};
  --cc-radius: ${v.radius}px;
  --cc-space: ${v.space}px;
  --cc-font-size: ${v["font-size"]}px;
}

.cc-shell { background:var(--cc-bg); color:var(--cc-text); font-size:var(--cc-font-size); }
.cc-panel { background:var(--cc-surface); border:1px solid var(--cc-line); border-radius:var(--cc-radius); padding:calc(var(--cc-space)*2); }
.cc-muted { color:var(--cc-muted); }
.cc-primary { color:var(--cc-primary); }
.cc-accent { color:var(--cc-accent); }
.cc-danger { color:var(--cc-danger); }
.cc-button { background:var(--cc-primary); color:var(--cc-bg); border:1px solid var(--cc-primary); border-radius:var(--cc-radius); padding:var(--cc-space) calc(var(--cc-space)*1.5); }
`;
 $("css-text").value=state.css;return state.css
}
function apply(){
 const v=vals(),r=document.documentElement.style;
 r.setProperty("--zzx-bg",v.bg);r.setProperty("--zzx-surface",v.surface);r.setProperty("--zzx-surface-2",v.surface2);r.setProperty("--zzx-text",v.text);r.setProperty("--zzx-muted",v.muted);r.setProperty("--zzx-green",v.primary);r.setProperty("--zzx-amber",v.accent);r.setProperty("--zzx-red",v.danger);r.setProperty("--zzx-line",v.line);r.setProperty("--zzx-radius",`${v.radius}px`);
 buildCSS();$("theme-output").textContent=JSON.stringify(v,null,2)
}
document.querySelectorAll(".preset").forEach(b=>b.onclick=()=>{const p=presets[b.dataset.preset];for(const [k,v] of Object.entries(p))$(k).value=v;apply()});
$("apply").onclick=apply;
function lum(hex){const n=hex.replace("#",""),rgb=[0,2,4].map(i=>parseInt(n.slice(i,i+2),16)/255).map(x=>x<=.03928?x/12.92:((x+.055)/1.055)**2.4);return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]}
function contrast(a,b){const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
$("check").onclick=()=>{const r=contrast($("fg-check").value,$("bg-check").value);$("ratio").textContent=`${r.toFixed(2)}:1`;$("aa").textContent=r>=4.5?"PASS":"FAIL";$("aaa").textContent=r>=7?"PASS":"FAIL";$("contrast-output").textContent=JSON.stringify({ratio:r,AA_normal:r>=4.5,AA_large:r>=3,AAA_normal:r>=7,AAA_large:r>=4.5},null,2)};
$("export-css").onclick=()=>{$("css-text").value=buildCSS();$("import-output").textContent="Built plain CSS custom-property theme."};
$("download-css").onclick=()=>{const t=$("css-text").value||buildCSS(),b=new Blob([t],{type:"text/css"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="cyberchefkit-theme.css";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
$("import-css").onclick=()=>{const t=$("css-text").value,map={bg:"--cc-bg",surface:"--cc-surface",surface2:"--cc-surface-2",text:"--cc-text",muted:"--cc-muted",primary:"--cc-primary",accent:"--cc-accent",danger:"--cc-danger",line:"--cc-line"};let n=0;for(const [id,key] of Object.entries(map)){const m=t.match(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\s*:\\s*(#[0-9a-fA-F]{6})"));if(m){$(id).value=m[1];n++}}apply();$("import-output").textContent=`Imported ${n} color token(s).`};
apply();window.CyberChefCSS=Object.freeze({version:"0.1.0-alpha-web",buildCSS,contrast,getTokens:vals});window.ZZXHooks?.emit("cyberchefcss:ready",{version:"0.1.0-alpha-web"})})();

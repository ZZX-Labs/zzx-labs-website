(()=>{"use strict";const $=id=>document.getElementById(id);let repos=[];
$("import").onchange=async()=>{const f=$("import").files[0];if(!f)return;try{const j=JSON.parse(await f.text());repos=Array.isArray(j)?j:(j.repositories||j.repos||[]);render()}catch(e){$("status").textContent="IMPORT ERROR: "+e.message}$("import").value=""};
$("sample").onclick=()=>{repos=[{name:"alpha",stargazers_count:42,forks_count:8,open_issues_count:3,language:"Python",size:3500,pushed_at:"2026-08-28T12:00:00Z"},{name:"beta",stargazers_count:18,forks_count:4,open_issues_count:1,language:"JavaScript",size:1200,pushed_at:"2026-08-27T12:00:00Z"},{name:"gamma",stargazers_count:7,forks_count:1,open_issues_count:0,language:"Kotlin",size:900,pushed_at:"2026-08-25T12:00:00Z"}];render()};
function val(r,k,alt){return Number(r[k]??r[alt]??0)||0}
function render(){
 const stars=repos.reduce((s,r)=>s+val(r,"stargazers_count","stars"),0),forks=repos.reduce((s,r)=>s+val(r,"forks_count","forks"),0),issues=repos.reduce((s,r)=>s+val(r,"open_issues_count","issues"),0),langs={};
 repos.forEach(r=>{const l=r.language||"Unknown";langs[l]=(langs[l]||0)+1});
 $("repos").textContent=repos.length;$("stars").textContent=stars;$("forks").textContent=forks;$("issues").textContent=issues;
 const e=$("rows");e.replaceChildren();repos.slice().sort((a,b)=>val(b,"stargazers_count","stars")-val(a,"stargazers_count","stars")).forEach(r=>{const d=document.createElement("div");d.className="repo-row";d.innerHTML=`<strong>${r.full_name||r.name||"repo"}</strong><div>★ ${val(r,"stargazers_count","stars")} · forks ${val(r,"forks_count","forks")} · issues ${val(r,"open_issues_count","issues")} · ${r.language||"Unknown"}</div>`;e.append(d)});
 $("langs").textContent=Object.entries(langs).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}: ${v}`).join("\n");makeSvg(stars,forks,issues)
}
function makeSvg(stars,forks,issues){const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])),title=esc($("title").value||"ZZX GitHub Stats"),svg=`<svg xmlns="http://www.w3.org/2000/svg" width="760" height="220" viewBox="0 0 760 220"><rect width="760" height="220" rx="12" fill="#121212"/><rect x="1" y="1" width="758" height="218" rx="11" fill="none" stroke="#343434"/><text x="30" y="46" fill="#c0d674" font-family="monospace" font-size="24" font-weight="700">${title}</text><text x="30" y="84" fill="#969696" font-family="monospace" font-size="14">SELF-HOSTED · PRIVACY-PRESERVING · REPRODUCIBLE</text><text x="30" y="142" fill="#e8e8e8" font-family="monospace" font-size="20">Repositories ${repos.length}</text><text x="260" y="142" fill="#e8e8e8" font-family="monospace" font-size="20">Stars ${stars}</text><text x="430" y="142" fill="#e8e8e8" font-family="monospace" font-size="20">Forks ${forks}</text><text x="585" y="142" fill="#e8e8e8" font-family="monospace" font-size="20">Issues ${issues}</text><text x="30" y="190" fill="#e6a42b" font-family="monospace" font-size="12">Generated locally by ZZX GitHub Stats</text></svg>`;$("svg-host").innerHTML=svg;$("svg-source").textContent=svg}
$("title").oninput=render;
function dl(text,name,type){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)}
$("svg").onclick=()=>dl($("svg-source").textContent,"zzx-github-stats.svg","image/svg+xml");
$("json").onclick=()=>dl(JSON.stringify({schema:"zzx.github.stats.v1",generated:new Date().toISOString(),repositories:repos},null,2),"zzx-github-stats.json","application/json");
$("markdown").onclick=()=>{$("markdown-out").textContent="![ZZX GitHub Stats](./zzx-github-stats.svg)"};
$("sample").click();window.ZZXGitHubStats=Object.freeze({version:"1.0.0-web",thirdPartyTracking:false});
})();

(()=>{"use strict";
const $=id=>document.getElementById(id);
let tasks=[],selected=null;
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function validUrl(u){try{const x=new URL(u);return ["http:","https:"].includes(x.protocol)}catch{return false}}
function add(){
 const url=$("url").value.trim(),authorized=$("authorized").checked;
 if(!validUrl(url)){out("Enter a valid HTTP(S) URL.");return}
 if(!authorized){out("Confirm you are authorized to archive/capture this source.");return}
 const t={id:crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2),created:new Date().toISOString(),url,title:$("title").value.trim(),kind:$("kind").value,format:$("format").value,segmentMinutes:Math.max(0,+$("segment").value||0),outputTemplate:$("template").value.trim()||"%(title)s-%(id)s.%(ext)s",status:"queued",authorized:true,notes:$("notes").value.trim()};
 tasks.push(t);render();out(JSON.stringify(t,null,2))
}
function out(t){$("task-output").textContent=t}
$("add-task").onclick=add;
function render(){
 const e=$("tasks");e.replaceChildren();
 tasks.forEach((t,i)=>{const d=document.createElement("div");d.className="otto-task";d.innerHTML=`<strong>${esc(t.title||t.url)}</strong> <span class="otto-pill">${esc(t.status)}</span><div class="fx-watermark">${esc(t.kind)} · ${esc(t.format)} · ${esc(t.url)}</div><div class="button-row" style="justify-content:flex-start"><button class="btn ghost" data-s="${i}">SELECT</button><button class="btn ghost" data-r="${i}">REMOVE</button></div>`;e.append(d)});
 e.querySelectorAll("[data-s]").forEach(b=>b.onclick=()=>select(+b.dataset.s));
 e.querySelectorAll("[data-r]").forEach(b=>b.onclick=()=>{tasks.splice(+b.dataset.r,1);render()});
 $("queued").textContent=tasks.filter(t=>t.status==="queued").length;$("done").textContent=tasks.filter(t=>t.status==="done").length;$("count").textContent=tasks.length;$("authorized-count").textContent=tasks.filter(t=>t.authorized).length
}
function select(i){selected=tasks[i];$("selected-output").textContent=JSON.stringify(selected,null,2);buildCommand(selected)}
function shQuote(s){return "'"+String(s).replaceAll("'","'\\''")+"'"}
function buildCommand(t){
 const fmt=t.format==="best-audio"?"bestaudio/best":t.format==="mp4"?"bv*+ba/b":"best";
 const args=["yt-dlp","--no-playlist","--restrict-filenames","-f",fmt,"-o",t.outputTemplate];
 if(t.segmentMinutes>0)args.push("--downloader","ffmpeg","--downloader-args",`ffmpeg_i:-f segment -segment_time ${Math.round(t.segmentMinutes*60)}`);
 args.push(t.url);
 $("command").textContent=args.map(shQuote).join(" ");
}
$("mark-running").onclick=()=>{if(!selected)return;selected.status="running";render();select(tasks.indexOf(selected))};
$("mark-done").onclick=()=>{if(!selected)return;selected.status="done";selected.completed=new Date().toISOString();render();select(tasks.indexOf(selected))};
$("export").onclick=()=>{const doc={schema:"zzx.otto.queue.v1",exported:new Date().toISOString(),tasks,execution:"not performed by browser",policy:"authorized/licensed/public sources only"},text=JSON.stringify(doc,null,2),b=new Blob([text],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="otto-queue.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
render();window.otto=Object.freeze({version:"0.3.0-alpha-web",executesDownloads:false});
})();

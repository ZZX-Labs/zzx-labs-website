(()=>{"use strict";const $=id=>document.getElementById(id);let jobs=[];
function build(){
 const url=$("url").value.trim();if(!/^https?:\/\//i.test(url)){ $("status").textContent="Enter an HTTP(S) media URL.";return}
 const job={schema:"zzx.ytrp.job.v1",created:new Date().toISOString(),url,mode:$("mode").value,container:$("container").value,audioCodec:$("audio-codec").value,quality:$("quality").value,outputTemplate:$("template").value,writeMetadata:$("metadata").checked,embedThumbnail:$("thumb").checked,useArchive:$("archive").checked,legalScope:"user-owned / authorized / openly licensed / public-domain media only",cookies:false,vpnRotation:false,drmBypass:false};
 jobs.push(job);render();$("status").textContent="Job added."
}
$("add").onclick=build;
function render(){const e=$("jobs");e.replaceChildren();jobs.forEach((j,i)=>{const d=document.createElement("div");d.className="job";d.innerHTML=`<strong>${i+1}. ${j.mode} · ${j.quality}</strong><div>${j.url}</div><div class="fx-watermark">${j.outputTemplate} · archive ${j.useArchive?"on":"off"} · cookies off · DRM bypass off</div><button class="btn ghost" data-i="${i}">REMOVE</button>`;e.append(d)});e.querySelectorAll("[data-i]").forEach(b=>b.onclick=()=>{jobs.splice(+b.dataset.i,1);render()});$("count").textContent=jobs.length}
function shellQuote(s){return "'"+String(s).replace(/'/g,"'\\''")+"'"}
$("command").onclick=()=>{
 const j=jobs.at(-1);if(!j){$("command-output").textContent="Add a job first.";return}
 let a=["yt-dlp","--no-playlist","--ignore-config","--restrict-filenames","-o",j.outputTemplate];
 if(j.useArchive)a.push("--download-archive","ytrp-archive.txt");
 if(j.writeMetadata)a.push("--write-info-json");
 if(j.embedThumbnail)a.push("--embed-thumbnail");
 if(j.mode==="audio")a.push("-x","--audio-format",j.audioCodec);
 else a.push("-f",j.quality==="best"?"bv*+ba/b":"b[height<=1080]/b");
 a.push(j.url);$("command-output").textContent=a.map(shellQuote).join(" ")
};
$("export").onclick=()=>{const t=JSON.stringify({schema:"zzx.ytrp.queue.v1",exported:new Date().toISOString(),jobs},null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="ytrp-queue.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
$("url").value="https://www.youtube.com/watch?v=EXAMPLE";render();window.YTRP=Object.freeze({version:"0.5.0-alpha-web",cookies:false,vpnRotation:false,drmBypass:false});
})();

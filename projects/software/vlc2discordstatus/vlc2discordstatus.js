(()=>{"use strict";const $=id=>document.getElementById(id);let vlc={},payload={};
function parseStatus(j){
 const info=j.information||{},cat=info.category||{},meta=cat.meta||j.meta||{};
 return{title:meta.title||meta.filename||j.title||"",artist:meta.artist||"",album:meta.album||"",state:j.state||"stopped",time:Number.isFinite(+j.time)?+j.time:0,length:Number.isFinite(+j.length)?+j.length:0,filename:meta.filename||""}
}
$("import").onchange=async()=>{const f=$("import").files[0];if(!f)return;try{vlc=parseStatus(JSON.parse(await f.text()));$("title").value=vlc.title;$("artist").value=vlc.artist;$("album").value=vlc.album;$("state").value=vlc.state;$("position").value=vlc.time;$("length").value=vlc.length;build()}catch(e){$("output").textContent="IMPORT ERROR: "+e.message}$("import").value=""};
function build(){
 const title=$("title").value.trim()||"VLC Media",artist=$("artist").value.trim(),album=$("album").value.trim(),state=$("state").value,pos=Math.max(0,+$("position").value||0),len=Math.max(0,+$("length").value||0),now=Math.floor(Date.now()/1000);
 payload={schema:"zzx.vlc2discordstatus.presence.v1",state:artist?`by ${artist}`:state,details:title,timestamps:state==="playing"?{start:now-Math.floor(pos),end:len>pos?now+Math.floor(len-pos):undefined}:undefined,large_image:$("large-image").value.trim()||"vlc",large_text:album||"VLC media",small_image:state==="playing"?"play":state==="paused"?"pause":"stop",small_text:state,buttons:$("button-url").value.trim()?[{label:"Open project",url:$("button-url").value.trim()}]:[],source:{player:"VLC",positionSeconds:pos,lengthSeconds:len},discordRpcExecuted:false};
 $("details").textContent=payload.details;$("card-state").textContent=payload.state;$("card-meta").textContent=`${album||"No album"} · ${state} · ${pos.toFixed(0)}/${len.toFixed(0)}s`;$("output").textContent=JSON.stringify(payload,null,2)
}
["title","artist","album","state","position","length","large-image","button-url"].forEach(id=>$(id).oninput=build);
$("download").onclick=()=>{build();const t=JSON.stringify(payload,null,2),b=new Blob([t],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="vlc2discordstatus-presence.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
build();window.VLC2DiscordStatus=Object.freeze({version:"1.0.0-web",discordIPC:false});
})();

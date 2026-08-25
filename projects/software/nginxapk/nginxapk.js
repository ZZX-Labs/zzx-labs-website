(()=>{"use strict";
const $=id=>document.getElementById(id);
const profiles={
 static:{name:"Static Site",port:8080,root:"/storage/emulated/0/nginx/site",proxy:"",autoindex:false},
 dashboard:{name:"Local Dashboard",port:8088,root:"/storage/emulated/0/nginx/dashboard",proxy:"",autoindex:false},
 proxy:{name:"Localhost Reverse Proxy",port:8090,root:"/storage/emulated/0/nginx/site",proxy:"http://127.0.0.1:5000",autoindex:false},
 files:{name:"Offline File Index",port:8081,root:"/storage/emulated/0/nginx/files",proxy:"",autoindex:true}
};
let conf="",report=null;
function escNginx(s){return String(s||"").replace(/[;\r\n{}]/g,"").trim()}
function load(id){const p=profiles[id];$("profile").value=id;$("port").value=p.port;$("root").value=p.root;$("proxy").value=p.proxy;$("autoindex").checked=p.autoindex;build()}
function build(){
 const port=Math.max(1024,Math.min(65535,+$("port").value||8080)),root=escNginx($("root").value),proxy=escNginx($("proxy").value),host=$("bind").value==="loopback"?"127.0.0.1":"0.0.0.0",idx=escNginx($("index").value)||"index.html";
 const body=proxy?`location / {\n        proxy_pass ${proxy};\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n    }`:`location / {\n        root ${root};\n        index ${idx};\n        try_files $uri $uri/ =404;\n        autoindex ${$("autoindex").checked?"on":"off"};\n    }`;
 conf=`worker_processes  1;\nerror_log  logs/error.log notice;\npid        logs/nginx.pid;\n\nevents { worker_connections 256; }\n\nhttp {\n    include       mime.types;\n    default_type  application/octet-stream;\n    sendfile      on;\n    server_tokens off;\n\n    server {\n        listen ${host}:${port};\n        server_name localhost;\n        ${body.replaceAll("\n","\n        ")}\n    }\n}\n`;
 $("config").textContent=conf;validate()
}
function validate(){
 const issues=[],port=+$("port").value,root=$("root").value.trim(),proxy=$("proxy").value.trim();
 if(port<1024||port>65535)issues.push("port must be 1024–65535 for this profile builder");
 if(!root.startsWith("/"))issues.push("document root should be an absolute Android/Linux path");
 if(proxy&&!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/.*)?$/.test(proxy))issues.push("reverse proxy is constrained to localhost HTTP targets");
 if(/[;\r\n{}]/.test($("root").value)||/[;\r\n{}]/.test(proxy))issues.push("configuration field contains forbidden nginx syntax characters");
 report={schema:"zzx.nginxapk.profile.v1",profile:$("profile").value,bind:$("bind").value,port,root,proxy:proxy||null,valid:!issues.length,issues,apkIncluded:false,nativeExecution:false};
 $("validation").textContent=JSON.stringify(report,null,2);$("state").textContent=issues.length?"REVIEW":"VALID"
}
["port","root","proxy","bind","index","autoindex"].forEach(id=>$(id).oninput=build);
$("profile").onchange=()=>load($("profile").value);
$("export-conf").onclick=()=>{const b=new Blob([conf],{type:"text/plain"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="nginx.conf";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
$("export-profile").onclick=()=>{validate();const b=new Blob([JSON.stringify(report,null,2)],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="nginxapk-profile.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),800)};
load("static");window.nginxAPK=Object.freeze({version:"0.1.0-alpha-web",apkIncluded:false,profiles});
})();

(()=>{"use strict";
const C={
 esc:s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])),
 csv(text){const lines=text.split(/\r?\n/).filter(x=>x.trim());if(!lines.length)return[];const parse=line=>{const o=[];let q=false,c="";for(let i=0;i<=line.length;i++){const ch=line[i];if(ch==='"'){if(q&&line[i+1]==='"'){c+='"';i++}else q=!q}else if((ch===','||i===line.length)&&!q){o.push(c);c=""}else c+=ch??""}return o};const h=parse(lines.shift()).map(x=>x.trim());return lines.map(l=>{const r=parse(l);return Object.fromEntries(h.map((k,i)=>[k,(r[i]??"").trim()]))})},
 any(text){const t=text.trim();if(!t)return[];if(t[0]==='['||t[0]==='{'){const x=JSON.parse(t);return Array.isArray(x)?x:(x.records||x.rows||x.entities||x.events||x.edges||[])}return C.csv(t)},
 dl(t,n,type="application/json"){const b=new Blob([t],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=n;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)},
 fnv(s){let h=2166136261>>>0;for(const ch of String(s)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0).toString(16).padStart(8,'0')},
 validIPv4(s){const p=String(s).split('.');return p.length===4&&p.every(x=>/^\d+$/.test(x)&&+x>=0&&+x<=255)},
 ipv4Class(s){if(!C.validIPv4(s))return null;const p=s.split('.').map(Number);if(p[0]===10||p[0]===127||p[0]===192&&p[1]===168||p[0]===172&&p[1]>=16&&p[1]<=31)return 'private/reserved';if(p[0]>=224)return 'multicast/reserved';return 'public'},
 normEmail(s){const v=String(s).trim().toLowerCase(),i=v.lastIndexOf('@');if(i<1)return null;return{local:v.slice(0,i),domain:v.slice(i+1),address:v}},
 luhn(s){const d=String(s).replace(/\D/g,'');let sum=0,alt=false;for(let i=d.length-1;i>=0;i--){let n=+d[i];if(alt&&(n*=2)>9)n-=9;sum+=n;alt=!alt}return d.length>0&&sum%10===0},
 geohash(lat,lon,n=8){const A='0123456789bcdefghjkmnpqrstuvwxyz';let lr=[-90,90],or=[-180,180],even=true,bits=0,ch=0,out='';while(out.length<n){const r=even?or:lr,v=even?lon:lat,mid=(r[0]+r[1])/2;ch=(ch<<1)|(v>=mid?1:0);if(v>=mid)r[0]=mid;else r[1]=mid;even=!even;if(++bits===5){out+=A[ch];bits=0;ch=0}}return out},
 dist(a,b,c,d){const R=6371,rad=x=>x*Math.PI/180,dl=rad(c-a),dn=rad(d-b),q=Math.sin(dl/2)**2+Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(q))}
};
window.ScopeCore=Object.freeze(C);
})();

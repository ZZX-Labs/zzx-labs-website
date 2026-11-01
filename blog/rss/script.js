// RSS landing-page original article art previews; no third-party runtime.
(async()=>{const host=document.getElementById('rss-previews');if(!host)return;
try{const [posts,arts]=await Promise.all([fetch('/blog/manifest.json').then(r=>r.json()),fetch('/blog/hero-assignments.json').then(r=>r.json())]);
const seen=new Set();for(const p of (posts.posts||[]).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)))){
const key=new URL(p.url,location.origin).pathname.replace(/\/$/,'');const a=arts.by_url[key];if(!a||seen.has(a.path))continue;seen.add(a.path);
const item=document.createElement('article');item.className='feature';const fig=document.createElement('div');fig.className='thumb';const img=document.createElement('img');img.src=a.path;img.alt=a.alt;img.loading='lazy';fig.appendChild(img);
const body=document.createElement('div');body.className='body';const h=document.createElement('h3');const link=document.createElement('a');link.href=p.url;link.textContent=p.title;h.appendChild(link);body.appendChild(h);const desc=document.createElement('p');desc.textContent=p.description||'';body.appendChild(desc);
item.append(fig,body);host.appendChild(item);if(seen.size>=6)break;
}}
catch(err){const e=document.createElement('p');e.textContent='Feed previews unavailable; use RSS XML link above.';host.appendChild(e);}
})();

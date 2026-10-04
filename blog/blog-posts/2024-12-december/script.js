// blog/blog-posts/2024-12-december/script.js
(() => {
  const LIST = document.getElementById('month-posts');
  const SEARCH = document.getElementById('search');
  const TAGSEL = document.getElementById('tag-filter');
  const SHUFFLE = document.getElementById('shuffle');
  const ROOT = location.pathname.replace(/\/$/, ''); // current dir

  let POSTS = [];
  let TAGS = new Set();

  const el = (t,c,txt)=>{const n=document.createElement(t);if(c)n.className=c;if(txt)n.textContent=txt;return n;};
  const shuffle = arr => {for(let i=arr.length-1;i>0;i--){const j=(Math.random()*(i+1))|0;[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;};
  async function fetchJSON(url){try{const r=await fetch(url,{cache:'no-cache'});if(!r.ok)return null;return await r.json();}catch{return null;}}

  function normalize(p){return{
    title:p.title||'Untitled',url:p.url||'#',description:p.description||'',
    date:p.date?new Date(p.date).toISOString():new Date().toISOString(),
    thumb:p.thumb||'',tags:Array.isArray(p.tags)?p.tags:[]
  };}

  function collectTags(items){items.forEach(p=>(p.tags||[]).forEach(t=>TAGS.add(t)));}
  function fillTagSelect(){
    TAGSEL.innerHTML='<option value="">All tags</option>';
    [...TAGS].sort().forEach(t=>{const o=document.createElement('option');o.value=t;o.textContent=t;TAGSEL.appendChild(o);});
  }

  function matchFilters(p){
    const q=(SEARCH.value||'').toLowerCase().trim();const tag=TAGSEL.value;
    const hay=`${p.title} ${p.description}`.toLowerCase();
    return (!q||hay.includes(q)) && (!tag||(p.tags||[]).includes(tag));
  }

  function render(items){
    LIST.innerHTML='';
    const filtered=items.filter(matchFilters);
    if(!filtered.length){LIST.appendChild(el('p','loading','No posts match.'));return;}
    for(const it of filtered){
      const wrap=el('div','feature');
      const thumb=el('div','thumb');
      if(it.thumb){const img=new Image();img.src=it.thumb;thumb.appendChild(img);}else{thumb.appendChild(el('span','muted','—'));}
      wrap.appendChild(thumb);

      const body=el('div','body');
      const h3=el('h3');const a=el('a',null,it.title);a.href=it.url;h3.appendChild(a);body.appendChild(h3);
      if(it.description)body.appendChild(el('p',null,it.description));
      const btn=el('a','btn','Read Post');btn.href=it.url;body.appendChild(btn);
      body.appendChild(el('div','meta',new Date(it.date).toLocaleString()));
      if(it.tags&&it.tags.length){const tg=el('div','tags');it.tags.forEach(t=>tg.appendChild(el('span','tag',t)));body.appendChild(tg);}
      wrap.appendChild(body);
      LIST.appendChild(wrap);
    }
  }

  async function boot(){
    LIST.innerHTML='<p class="loading">Loading posts…</p>';
    const mf=await fetchJSON(`${ROOT}/manifest.json`);
    POSTS=(mf?.posts||[]).map(normalize).sort((a,b)=>new Date(b.date)-new Date(a.date));
    collectTags(POSTS);fillTagSelect();render(POSTS);

    SHUFFLE?.addEventListener('click',()=>render(shuffle(POSTS.slice())));
    SEARCH?.addEventListener('input',()=>render(POSTS));
    TAGSEL?.addEventListener('change',()=>render(POSTS));
  }

  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',boot,{once:true});}else{boot();}
})();

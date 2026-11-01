/* ZZX-Labs public, read-only Blog API explorer v7.0; vanilla browser JS. */
(() => {
  'use strict';
  const form = document.getElementById('api-search-form');
  const output = document.getElementById('api-results');
  const search = document.getElementById('api-search');
  const category = document.getElementById('api-category');
  const state = document.getElementById('api-state');
  const count = document.getElementById('api-total') || document.getElementById('api-count');
  const message = document.getElementById('api-status');
  if (!form || !output || !search || !category || !message) return;
  let posts = [];
  const val = v => v == null ? '' : String(v);
  const elem = (tag, css, txt) => {
    const el = document.createElement(tag);
    if (css) el.className = css;
    if (txt !== undefined) el.textContent = txt;
    return el;
  };
  const safePath = p => /^\/blog\/blog-posts\/[a-z0-9_-]+\/[a-z0-9_-]+\/$/.test(val(p)) ? val(p) : '';
  const safeImage = p => /^\/assets\/hero\/[a-z0-9_-]+\.png$/.test(val(p)) ? val(p) : '';
  const parse = raw => ({
    title:val(raw.title || 'Untitled'),url:safePath(raw.url),thumb:safeImage(raw.thumb),
    hero_alt:val(raw.hero_alt || raw.title || ''),description:val(raw.description),
    category:val(raw.category || 'Research'),date:val(raw.date),
    tags:Array.isArray(raw.tags) ? raw.tags.map(val) : [],
    status:val(raw.status || (raw.published === true ? 'published' : 'unknown'))
  });
  const statusLabel = s => ({published:'Published','recovered-draft':'Recovered archival draft',
    'source-missing':'Original source text unavailable',pending:'Pending editorial review',
    scheduled:'Scheduled',draft:'Draft'}[s] || 'Editorial status: '+s);
  function resultCard(p) {
    const article=elem('article','api-result');
    if (p.thumb) {
      const a=elem('a','api-result-media'); a.href=p.url;
      const img=elem('img');img.src=p.thumb;img.alt=p.hero_alt;img.loading='lazy';img.decoding='async';
      img.addEventListener('error',()=>{img.hidden=true;a.classList.add('image-unavailable')},{once:true});
      a.append(img);article.append(a);
    }
    const body=elem('div','api-result-body');
    body.append(elem('p','api-result-meta',[p.category,p.date.slice(0,10)].filter(Boolean).join(' · ')));
    const h=elem('h3');const link=elem('a','',p.title);link.href=p.url;h.append(link);body.append(h);
    if(p.description)body.append(elem('p','api-result-description',p.description));
    body.append(elem('p','api-record-state'+(p.status==='published'?' is-published':''),statusLabel(p.status)));
    article.append(body);return article;
  }
  function render() {
    const query=search.value.trim().toLocaleLowerCase();
    const cat=category.value;
    const st=state ? state.value : '';
    const result=posts.filter(p=>(!cat || p.category===cat) && (!st || p.status===st) &&
      (!query || [p.title,p.description,p.category,p.status,...p.tags].join(' ').toLocaleLowerCase().includes(query)));
    const frag=document.createDocumentFragment();
    result.forEach(p=>frag.append(resultCard(p)));
    output.replaceChildren(frag);
    if(!result.length)output.append(elem('p','empty-message','No records match these filters.'));
    message.textContent=`Showing ${result.length} of ${posts.length} public catalog records.`;
  }
  async function load(){
    let records=null;
    for(const url of ['/blog/catalog.json','/blog/api/posts.json']){
      try{const r=await fetch(url,{cache:'no-cache'});if(!r.ok)continue;
        const json=await r.json();if(json&&Array.isArray(json.posts)){records=json.posts;break;}
      }catch(_){/* Try the next existing static endpoint. */}
    }
    if(!records){if(count)count.textContent='Catalog unavailable';
      message.textContent='Catalog unavailable. Use the JSON and RSS links above.';return;}
    const seen=new Set();
    posts=records.map(parse).filter(p=>{if(!p.url||seen.has(p.url))return false;seen.add(p.url);return true;});
    posts.sort((a,b)=>(Date.parse(b.date)||0)-(Date.parse(a.date)||0)||a.title.localeCompare(b.title));
    for(const name of [...new Set(posts.map(p=>p.category))].sort((a,b)=>a.localeCompare(b))){
      const option=elem('option','',name);option.value=name;category.append(option);}
    if(state){
      for(const s of [...new Set(posts.map(p=>p.status))].sort()){
        if([...state.options].some(o=>o.value===s))continue;
        const option=elem('option','',statusLabel(s));option.value=s;state.append(option);
      }
    }
    if(count)count.textContent=`${posts.length} catalog entries`;
    render();
  }
  search.addEventListener('input',render);
  category.addEventListener('change',render);
  if(state)state.addEventListener('change',render);
  form.addEventListener('reset',()=>queueMicrotask(render));
  load();
})();

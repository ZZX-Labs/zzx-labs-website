/* ZZX-LABS JOURNAL v7.1 — standalone browser controller, vanilla JS. */
(() => {
  'use strict';
  const page = document.body;
  if (!page || !page.classList.contains('zzx-blog-journal')) return;
  const ui = {
    search: document.getElementById('search'),
    category: document.getElementById('category-filter'),
    tag: document.getElementById('tag-filter'),
    sort: document.getElementById('sort-order'),
    shuffle: document.getElementById('shuffle'),
    featured: document.getElementById('featured-list'),
    rest: document.getElementById('recent-list'),
    count: document.getElementById('post-count'),
    result: document.getElementById('results-status'),
    empty: document.getElementById('empty-message'),
    featuredSection: document.getElementById('featured-section'),
    restSection: document.getElementById('rest-section')
  };
  if (!ui.featured || !ui.rest) return;
  let records = [];
  let shuffleKeys = null;
  const readCard = node => ({
    node,
    url: node.dataset.url || '', title: node.dataset.title || '',
    category: node.dataset.category || '', date: node.dataset.date || '',
    tags: (node.dataset.tags || '').split(/\s+/).filter(Boolean),
    status: node.dataset.status || ''
  });
  const currentRecords = () => [...ui.featured.querySelectorAll(':scope > .entry-card'), ...ui.rest.querySelectorAll(':scope > .entry-card')].map(readCard);
  const make = (name, cls, text) => {
    const el = document.createElement(name);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const pathOK = s => typeof s === 'string' && /^\/blog\/blog-posts\/\d{4}-\d{2}-[a-z]+\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/.test(s);
  const heroOK = s => typeof s === 'string' && /^\/assets\/hero\/[a-z0-9][a-z0-9-]*\.png$/.test(s);
  const relative = s => s.startsWith('/blog/') ? '../' + s.substring('/blog/'.length) : '../../' + s.substring(1);
  const setImageError = img => {
    img.addEventListener('error', () => {
      img.hidden = true;
      img.parentElement.classList.add('art-failed');
    }, {once: true});
    if (img.complete && img.naturalWidth === 0) {
      img.hidden = true;
      img.parentElement.classList.add('art-failed');
    }
  };
  function createCard(raw) {
    const article = make('article','entry-card');
    const tags = Array.isArray(raw.tags) ? raw.tags.filter(x=>typeof x==='string') : [];
    const title = String(raw.title || 'Untitled');
    const date = typeof raw.date==='string' ? raw.date : '';
    const category = String(raw.category || 'Research');
    const state = String(raw.status || 'recovered-draft');
    Object.assign(article.dataset,{url:raw.url,title,category,date,tags:tags.join(' '),status:state});
    const art = make('a','entry-art'); art.href = relative(raw.url); art.setAttribute('aria-label', 'Read '+title);
    if (heroOK(raw.thumb)) {
      const image = make('img'); image.src=relative(raw.thumb); image.alt=String(raw.hero_alt||title);
      image.loading='lazy';image.decoding='async';image.width=1200;image.height=675;
      setImageError(image);art.append(image);
    } else art.classList.add('art-failed');
    const copy=make('div','entry-copy'), line=make('div','entry-topline');
    const timestamp=make('time','',date.substring(0,10));timestamp.dateTime=date.substring(0,10);
    line.append(make('span','entry-category',category),timestamp);
    const h=make('h3'),link=make('a','',title);link.href=relative(raw.url);h.append(link);
    copy.append(line,h,make('p','entry-excerpt',raw.description||''));
    const tail=make('div','entry-tail');
    const label=state==='source-missing'?'Source unavailable':state==='published'?'Published':'Recovered draft';
    tail.append(make('span','entry-state'+(state==='source-missing'?' entry-state-warn':''),label));
    const read=make('a','entry-read','Read entry ↗');read.href=relative(raw.url);tail.append(read);
    copy.append(tail);article.append(art,copy);return article;
  }
  function populate(select, values, label) {
    if (!select) return;
    const old=select.value;
    select.replaceChildren();
    const first=make('option','',label);first.value='';select.append(first);
    [...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b)).forEach(v=>{
      const opt=make('option','',v);opt.value=v;select.append(opt);
    });
    if ([...select.options].some(o=>o.value===old)) select.value=old;
  }
  function filters() {
    const text=(ui.search?.value||'').trim().toLocaleLowerCase();
    const cat=ui.category?.value||'';
    const tag=ui.tag?.value||'';
    let output=records.filter(p=>(!cat||p.category===cat)&&(!tag||p.tags.includes(tag))&&(!text||[p.title,p.category,...p.tags].join(' ').toLocaleLowerCase().includes(text)||p.node.textContent.toLocaleLowerCase().includes(text)));
    const order=ui.sort?.value||'newest';
    if (shuffleKeys) {
      const ranks=new Map(shuffleKeys.map((p,i)=>[p,i]));
      output.sort((a,b)=>(ranks.get(a.url)??1e6)-(ranks.get(b.url)??1e6));
    } else if (order==='oldest') output.sort((a,b)=>a.date.localeCompare(b.date));
    else if (order==='title') output.sort((a,b)=>a.title.localeCompare(b.title));
    else output.sort((a,b)=>b.date.localeCompare(a.date));
    return output;
  }
  function render() {
    const all=filters();
    const first=all.slice(0,4), rest=all.slice(4);
    ui.featured.replaceChildren(...first.map(p=>p.node));
    ui.rest.replaceChildren(...rest.map(p=>p.node));
    if (ui.featuredSection) ui.featuredSection.hidden=!first.length;
    if (ui.restSection) ui.restSection.hidden=!rest.length;
    if (ui.empty) ui.empty.classList.toggle('visible',!all.length);
    if (ui.count) ui.count.textContent=String(records.length);
    if (ui.result) ui.result.textContent=`Showing ${all.length} of ${records.length} entries`;
  }
  function migrateLegacyPublisherCards() {
    // v6.6 of publish.py may rewrite these two grids using shared .blog-card HTML.
    // Upgrade such markup on-page so Journal's independent layout remains usable.
    for (const container of [ui.featured,ui.rest]) {
      for (const old of [...container.querySelectorAll(':scope > article.blog-card')]) {
        const link=old.querySelector('h3 a');
        const img=old.querySelector('.blog-card-art img');
        const meta=old.querySelector('.blog-meta');
        const date=(meta?.textContent||'').match(/\d{4}-\d{2}-\d{2}/)?.[0] || '';
        const url=link?.getAttribute('href') || old.dataset.url || '';
        if (!pathOK(url)) continue;
        const category=meta?.querySelector('span')?.textContent || 'Research';
        const tags=[...old.querySelectorAll('.blog-tag')].map(x=>x.textContent||'').filter(Boolean);
        const raw={url,title:link?.textContent||'Untitled',date,category,tags,
          description:old.querySelector('.blog-card-body > p')?.textContent||'',
          thumb:img?.getAttribute('src')||'',hero_alt:img?.alt||'',
          status:old.querySelector('.archive-flag')?'source-missing':'recovered-draft'};
        old.replaceWith(createCard(raw));
      }
    }
  }
  function setup() {
    migrateLegacyPublisherCards();
    records=currentRecords();
    populate(ui.category,records.map(p=>p.category),'All categories');
    populate(ui.tag,records.flatMap(p=>p.tags),'All topics');
    [ui.search,ui.category,ui.tag,ui.sort].forEach(el=>el&&el.addEventListener(el===ui.search?'input':'change',()=>{shuffleKeys=null;render();}));
    ui.shuffle?.addEventListener('click',()=>{
      const keys=records.map(p=>p.url);
      for(let i=keys.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[keys[i],keys[j]]=[keys[j],keys[i]];}
      shuffleKeys=keys;render();
    });
    document.querySelectorAll('.entry-art img, .hero img').forEach(setImageError);
    render();
  }
  async function refreshCatalog() {
    // Local file:// previews must work with the static 48-card fallback.
    // Served pages optionally hydrate newer entries from the canonical catalog.
    if (window.location.protocol==='file:') return;
    try {
      const response=await fetch('../catalog.json',{cache:'no-store'});
      if(!response.ok) throw new Error('Catalog HTTP '+response.status);
      const data=await response.json();
      if (!Array.isArray(data.posts)) throw new Error('Unexpected catalog schema');
      const valid=[],seen=new Set();
      for(const raw of data.posts){
        if(!raw||!pathOK(raw.url)||seen.has(raw.url)) continue;
        seen.add(raw.url);valid.push(raw);
      }
      if (!valid.length) throw new Error('Empty or invalid catalog');
      // Reconcile only when list differs to avoid unnecessary DOM replacement/flicker.
      const oldKeys=records.map(p=>p.url);
      const newKeys=valid.map(p=>p.url);
      if(oldKeys.length===newKeys.length&&oldKeys.every((p,i)=>p===newKeys[i]))return;
      const nodes=valid.map(createCard);
      ui.featured.replaceChildren(...nodes.slice(0,4));
      ui.rest.replaceChildren(...nodes.slice(4));
      records=currentRecords();
      populate(ui.category,records.map(p=>p.category),'All categories');
      populate(ui.tag,records.flatMap(p=>p.tags),'All topics');
      shuffleKeys=null;render();
    } catch(error) {
      console.info('Journal: using complete pre-rendered article index.',error.message);
    }
  }
  setup();refreshCatalog();
})();

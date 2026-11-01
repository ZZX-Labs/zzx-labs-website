/* ZZX-BLOG v7.3 · local filters; progressively enhances pre-rendered HTML. */
(()=>{'use strict';
  const $=id=>document.getElementById(id);
  const all=Array.from(document.querySelectorAll('.research-card[data-url]'));
  const search=$('search'),cat=$('category-filter'),state=$('status-filter'),sort=$('sort-order');
  const clear=$('clear-filters'),info=$('results-status');
  const featured=$('featured-list'),recent=$('recent-list');
  const monthGroups=Array.from(document.querySelectorAll('[data-month-group]'));
  const single=$('all-cards');
  function matches(c){const q=(search?.value||'').trim().toLocaleLowerCase();
    return (!q||(c.dataset.search||'').includes(q))&&(!cat?.value||c.dataset.category===cat.value)&&(!state?.value||c.dataset.status===state.value);}
  function sortCards(a,b){let mode=sort?.value||'newest';if(mode==='title')return a.dataset.title.localeCompare(b.dataset.title);
    let comp=(a.dataset.date||'').localeCompare(b.dataset.date||'');return mode==='oldest'?comp:-comp;}
  function place(parent,nodes){if(!parent)return;const fragment=document.createDocumentFragment();nodes.forEach(n=>fragment.append(n));parent.replaceChildren(fragment);}
  function update(){if(!all.length)return;const found=all.filter(matches).sort(sortCards);
    if(featured&&recent){place(featured,found.slice(0,2));place(recent,found.slice(2));
      document.getElementById('feature-section')?.toggleAttribute('hidden',!found.length);
      document.getElementById('all-section')?.toggleAttribute('hidden',found.length<=2);
    }else if(monthGroups.length){for(const group of monthGroups){const cards=found.filter(p=>p.dataset.date.startsWith(group.dataset.monthGroup));
        place(group.querySelector('[data-card-container]'),cards);group.toggleAttribute('hidden',cards.length===0);}}
    else if(single)place(single,found);
    if(info)info.textContent=`Showing ${found.length} of ${all.length} records`;
    const empty=$('empty-state');if(empty)empty.hidden=found.length!==0;
  }
  [search,cat,state,sort].forEach(e=>e?.addEventListener(e===search?'input':'change',update));
  clear?.addEventListener('click',()=>{if(search)search.value='';if(cat)cat.value='';if(state)state.value='';if(sort)sort.value='newest';update();search?.focus();});
  const copy=$('copy-feed');copy?.addEventListener('click',()=>{const link=copy.dataset.feed||'https://zzx-labs.io/blog/rss.xml';
    if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(link).then(()=>{copy.textContent='Feed URL copied';},()=>{copy.textContent=link;});}
    else{copy.textContent=link;}});
  document.querySelectorAll('.card-image img').forEach(img=>{
    const fail=()=>{img.parentElement?.classList.add('image-unavailable');};
    img.addEventListener('error',fail,{once:true});if(img.complete&&img.naturalWidth===0)fail();});
  update();
})();

// /portfolio/technology/software/script.js
// Identical to /technology/web/script.js but scoped for software.
// Loads ./manifest.json, shuffles items, and renders cards.
// Optionally injects each item's card.html when present.

(() => {
  const LIST = document.getElementById('portfolio-list');
  const SHUFFLE = document.getElementById('shuffle');
  const SAMPLE_SIZE = 12;

  const isDomain = (s) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(String(s||'').trim());
  const el = (t, c, txt) => { const n = document.createElement(t); if(c) n.className=c; if(txt!=null) n.textContent=txt; return n; };
  const shuffleInPlace = (a)=>{ for(let i=a.length-1;i>0;i--){const j=(Math.random()*(i+1))|0; [a[i],a[j]]=[a[j],a[i]];} return a; };

  async function fetchJSON(url){ const r=await fetch(url,{cache:'no-cache'}); if(!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }
  async function fetchCardHTML(href){
    try{
      const url = href.replace(/\/?$/, '/') + 'card.html';
      const r = await fetch(url,{cache:'no-cache'});
      if(!r.ok) return null;
      return await r.text();
    }catch{return null;}
  }

  function cardSkeleton(item){
    const href = item.href || `./${item.slug}/`;
    const raw = item.title || item.slug || 'Untitled';
    const title = isDomain(raw) ? raw.toLowerCase() : raw;

    const root = el('div','feature');
    const th = el('div','thumb');
    root.appendChild(th);

    if(item.thumb){ const img=new Image(); img.src=item.thumb; img.alt=''; th.appendChild(img); }
    else th.appendChild(el('span','muted','—'));

    const body = el('div','body');
    body.appendChild(el('h3',null,title));
    if(item.blurb) body.appendChild(el('p',null,item.blurb));

    const open = el('a','btn',item.linkText || `Open ${title}`);
    open.href = href;
    if(/^https?:\/\//i.test(href)){ open.target='_blank'; open.rel='noopener noreferrer'; }
    body.appendChild(open);

    if(item.note) body.appendChild(el('div','meta',item.note));
    root.appendChild(body);
    return root;
  }

  async function render(items){
    LIST.innerHTML = '';
    if(!items.length){ LIST.appendChild(el('p','loading','No software portfolio items yet.')); return; }

    const sample = shuffleInPlace(items.slice()).slice(0,SAMPLE_SIZE);
    for(const it of sample){
      const card = cardSkeleton(it);
      LIST.appendChild(card);
      const href = it.href || `./${it.slug}/`;
      const html = await fetchCardHTML(href);
      if(html){
        const body = card.querySelector('.body');
        const box = document.createElement('div');
        box.innerHTML = html;
        box.querySelectorAll('script').forEach(s=>s.remove());
        body.insertBefore(box, body.querySelector('.btn'));
      }
    }
  }

  async function boot(){
    try{
      const data = await fetchJSON('./manifest.json');
      const items = Array.isArray(data?.projects) ? data.projects : [];
      await render(items);
      SHUFFLE?.addEventListener('click', () => render(items));
    }catch(e){
      console.error(e);
      LIST.innerHTML = `<p class="loading">Failed to load: ${e.message}</p>`;
    }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();

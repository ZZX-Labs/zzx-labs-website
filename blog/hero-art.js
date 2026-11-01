/* ZZX semantic art allocator v2. Canonical per-URL artwork remains identical across views;
   no image is allocated to two different articles in a view. Newly published posts must
   include an art assignment; unverified third-party stock art is never used by default. */
window.ZZXHero = (() => {
  let mapping = null;
  const active = new Map();
  const RESERVED = new Set();
  const urlKey = (url) => {try {return new URL(url, location.origin).pathname.replace(/\/$/, '') || '/';}catch{return String(url).replace(/\/$/,'');}};
  const load = async () => {
    if (mapping) return mapping;
    try {const r = await fetch('/blog/hero-assignments.json', {cache:'no-cache'});
         if(r.ok){mapping = await r.json();return mapping;}} catch(e){}
    mapping = {by_url:{}, images:[]};return mapping;
  };
  const normalize = async (posts) => {
    const m=await load(), out=[];
    for(const p of posts) {
      const key=urlKey(p.url||''), rec=m.by_url[key];
      if(!key || key==='/') continue;
      const result={...p};
      if(active.has(key)) {result.thumb=active.get(key).path;result.hero_alt=active.get(key).alt;}
      else if(rec && !RESERVED.has(rec.path)) {
        result.thumb=rec.path;result.hero_alt=rec.alt;
        active.set(key,rec); RESERVED.add(rec.path);
      } else {
        // Existing manually reviewed art is allowed only if not already assigned.
        const known=(m.images||[]).find(x => x.path===p.thumb && x.publication_approved===true);
        if(known && !RESERVED.has(known.path)){
          result.hero_alt=known.alt;active.set(key,known); RESERVED.add(known.path);
        } else {result.thumb='';result.hero_alt='';} // Never misrepresent a mismatched photograph.
      }
      out.push(result);
    }
    return out;
  };
  return {normalize};
})();

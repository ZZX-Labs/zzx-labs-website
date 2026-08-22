(() => {
  "use strict";

  const enc=new TextEncoder();

  async function sha256(text) {
    const d=await crypto.subtle.digest("SHA-256",enc.encode(String(text)));
    return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("");
  }

  function tokens(text) {
    return (String(text).toLowerCase().match(/[\p{L}\p{N}_'-]+/gu)||[]).filter(x=>x.length>1);
  }

  function chunkText(text,size=1200,overlap=150) {
    const s=String(text).replace(/\r/g,"").trim();
    if(!s)return[];
    const out=[];
    let start=0;
    size=Math.max(200,Math.floor(size));
    overlap=Math.max(0,Math.min(size-1,Math.floor(overlap)));
    while(start<s.length) {
      let end=Math.min(s.length,start+size);
      if(end<s.length) {
        const boundary=Math.max(s.lastIndexOf("\n",end),s.lastIndexOf(". ",end),s.lastIndexOf(" ",end));
        if(boundary>start+size*.55)end=boundary+1;
      }
      out.push(s.slice(start,end).trim());
      if(end>=s.length)break;
      start=Math.max(start+1,end-overlap);
    }
    return out.filter(Boolean);
  }

  function hashedVector(text,dims=384) {
    const v=new Float32Array(dims);
    for(const tok of tokens(text)) {
      let h=2166136261>>>0;
      for(let i=0;i<tok.length;i++){h^=tok.charCodeAt(i);h=Math.imul(h,16777619)>>>0;}
      const idx=h%dims;
      const sign=(h&0x80000000)?-1:1;
      v[idx]+=sign*(1+Math.log1p(tok.length));
    }
    let norm=0;for(const x of v)norm+=x*x;norm=Math.sqrt(norm)||1;for(let i=0;i<v.length;i++)v[i]/=norm;
    return v;
  }

  function cosine(a,b) {
    let s=0;const n=Math.min(a.length,b.length);for(let i=0;i<n;i++)s+=a[i]*b[i];return s;
  }

  function lexical(query,text) {
    const q=new Set(tokens(query)),t=tokens(text);
    if(!q.size||!t.length)return 0;
    let hits=0;for(const tok of t)if(q.has(tok))hits++;
    return hits/Math.sqrt(q.size*t.length);
  }

  window.BerossusCorpusCore=Object.freeze({sha256,tokens,chunkText,hashedVector,cosine,lexical});
})();

(() => {
  "use strict";
  async function sha256Hex(text){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(text)));return[...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("");}
  function canonical(v){if(Array.isArray(v))return`[${v.map(canonical).join(",")}]`;if(v&&typeof v==="object")return`{${Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canonical(v[k])).join(",")}}`;return JSON.stringify(v);}
  window.BitLegalCore=Object.freeze({sha256Hex,canonical});
})();

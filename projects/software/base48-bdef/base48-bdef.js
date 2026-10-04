(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  let currentFileName="decoded.bin";
  let fileBytes=null;

  async function sha256(bytes){const d=await crypto.subtle.digest("SHA-256",bytes);return[...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("");}
  function downloadBlob(blob,name){const u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
  function downloadText(text,name){downloadBlob(new Blob([text],{type:"text/plain;charset=utf-8"}),name);}

  function updateTextMetrics(){
    const plainBytes=new TextEncoder().encode($("text-plain").value).length,b48=$("text-base48").value,inspect=Base48Codec.inspect(b48);
    $("text-bytes").textContent=plainBytes;$("text-chars").textContent=b48.length;$("text-canonical").textContent=b48?String(inspect.canonical).toUpperCase():"—";$("text-expansion").textContent=plainBytes?(b48.length/plainBytes).toFixed(3)+"×":"—";
  }

  function encodeText(){try{$("text-base48").value=Base48Codec.encodeText($("text-plain").value);updateTextMetrics();}catch(e){alert(e.message);}}
  function decodeText(){try{$("text-plain").value=Base48Codec.decodeText($("text-base48").value);updateTextMetrics();}catch(e){alert(e.message);}}
  function encodeHex(){try{const b=Base48Codec.hexToBytes($("hex-input").value),x=Base48Codec.encode(b);$("hex-base48").value=x;$("hex-output").textContent=JSON.stringify({bytes:b.length,base48Chars:x.length,roundTripHex:Base48Codec.bytesToHex(Base48Codec.decode(x))},null,2);}catch(e){$("hex-output").textContent=`ERROR: ${e.message}`;}}
  function decodeHex(){try{const b=Base48Codec.decode($("hex-base48").value),h=Base48Codec.bytesToHex(b);$("hex-input").value=h;$("hex-output").textContent=JSON.stringify({bytes:b.length,hex:h},null,2);}catch(e){$("hex-output").textContent=`ERROR: ${e.message}`;}}

  async function loadFile(file){
    fileBytes=new Uint8Array(await file.arrayBuffer());currentFileName=file.name;$("file-base48").value=Base48Codec.encode(fileBytes);$("file-name").textContent=file.name;$("file-bytes").textContent=fileBytes.length.toLocaleString();$("file-chars").textContent=$("file-base48").value.length.toLocaleString();$("file-sha").textContent=(await sha256(fileBytes)).slice(0,16)+"…";
  }

  function inspect(){const result=Base48Codec.inspect($("inspect-input").value);$("inspect-output").textContent=JSON.stringify(result,null,2);}
  function renderAlphabet(){$("alphabet-output").textContent=`Bitcoin Base58 alphabet:\\n123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz\\n\\nRemoved:\\nC c S s P p A a M m\\n\\nCanonical Base48 alphabet (${Base48Codec.ALPHABET.length}):\\n${Base48Codec.ALPHABET}`;const grid=$("alphabet-grid");grid.replaceChildren();[...Base48Codec.ALPHABET].forEach(ch=>{const s=document.createElement("span");s.textContent=ch;grid.appendChild(s);});}

  function vectors(){
    const inputs=["","0","Hello","Hello, Base48.","Bitcoin","₿","こんにちは","0000"];
    const body=$("vector-body");body.replaceChildren();
    for(const text of inputs){const bytes=new TextEncoder().encode(text),hex=Base48Codec.bytesToHex(bytes),b48=Base48Codec.encode(bytes);let ok=false;try{ok=Base48Codec.decodeText(b48,{fatal:false})===text;}catch{}const tr=document.createElement("tr");[text||"(empty)",hex||"(empty)",b48||"(empty)",ok?"PASS":"FAIL"].forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.appendChild(td);});body.appendChild(tr);}
  }

  $("text-encode").addEventListener("click",encodeText);$("text-decode").addEventListener("click",decodeText);$("text-swap").addEventListener("click",()=>{const a=$("text-plain").value;$("text-plain").value=$("text-base48").value;$("text-base48").value=a;updateTextMetrics();});
  $("text-plain").addEventListener("input",updateTextMetrics);$("text-base48").addEventListener("input",updateTextMetrics);$("hex-encode").addEventListener("click",encodeHex);$("hex-decode").addEventListener("click",decodeHex);
  $("file-input").addEventListener("change",async()=>{const f=$("file-input").files?.[0];if(f)await loadFile(f);$("file-input").value="";});
  $("file-download-text").addEventListener("click",()=>downloadText($("file-base48").value,`${currentFileName}.b48.txt`));
  $("file-decode-download").addEventListener("click",()=>{try{downloadBlob(new Blob([Base48Codec.decode($("file-base48").value)],{type:"application/octet-stream"}),currentFileName?`${currentFileName}.decoded`:"decoded.bin");}catch(e){alert(e.message);}});
  $("inspect-run").addEventListener("click",inspect);

  renderAlphabet();vectors();encodeText();$("inspect-input").value=$("text-base48").value;inspect();encodeHex();

  window.Base48=Object.freeze({version:"1.0.0-web",alphabet:Base48Codec.ALPHABET,encode:Base48Codec.encode,decode:Base48Codec.decode,encodeText:Base48Codec.encodeText,decodeText:Base48Codec.decodeText,hexToBytes:Base48Codec.hexToBytes,bytesToHex:Base48Codec.bytesToHex,inspect:Base48Codec.inspect});
  window.ZZXHooks?.emit("base48:ready",{version:"1.0.0-web"});
})();

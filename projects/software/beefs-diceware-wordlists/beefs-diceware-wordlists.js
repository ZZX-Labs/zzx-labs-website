(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const state={rawBytes:null,rawText:"",parsed:null,filename:"wordlist.txt"};

  function fmtPct(x){return `${(x*100).toFixed(3)}%`;}
  function download(text,name){const b=new Blob([text],{type:"text/plain;charset=utf-8"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}

  async function loadFile(file) {
    state.rawBytes=new Uint8Array(await file.arrayBuffer());
    state.rawText=new TextDecoder("utf-8",{fatal:false}).decode(state.rawBytes);
    state.filename=file.name;
    state.parsed=DicewareCore.parseWordlist(state.rawText);
    const sha=await DicewareVerifier.sha256Hex(state.rawBytes);

    $("wl-count").textContent=state.parsed.count;
    $("wl-valid").textContent=state.parsed.valid?"YES":"NO";
    $("wl-unique").textContent=state.parsed.uniqueWords;
    $("wl-sha").textContent=sha.slice(0,16)+"…";
    $("wl-output").textContent=JSON.stringify({
      filename:file.name,
      locale:$("wordlist-locale").value.trim()||"unspecified",
      entries:state.parsed.count,
      expected:DicewareCore.EXPECTED,
      uniqueWords:state.parsed.uniqueWords,
      missingCodes:state.parsed.missing.slice(0,25),
      missingCount:state.parsed.missing.length,
      parseErrors:state.parsed.errors.slice(0,25),
      sha256:sha,
      valid:state.parsed.valid
    },null,2);
  }

  function generate() {
    if(!state.parsed?.valid)throw new Error("Load a valid 7,776-entry wordlist first.");
    const count=Math.max(3,Math.min(20,Math.floor(Number($("gen-words").value)||6)));
    const items=DicewareCore.generate(state.parsed.map,count);
    let words=items.map(x=>x.word);
    const casing=$("gen-case").value;
    if(casing==="lower")words=words.map(w=>w.toLowerCase());
    if(casing==="upper")words=words.map(w=>w.toUpperCase());
    const phrase=words.join($("gen-separator").value);
    $("gen-output").textContent=`${phrase}\n\nDice codes: ${items.map(x=>x.code).join(" ")}`;
    $("gen-count").textContent=count;
    $("gen-entropy").textContent=`${(count*DicewareCore.BITS_PER_WORD).toFixed(2)} bits`;
    $("gen-rolls").textContent=count*5;
  }

  function manual() {
    if(!state.parsed?.valid)throw new Error("Load a valid wordlist first.");
    const codes=String($("manual-codes").value).match(/[1-6]{5}/g)||[];
    const resolved=codes.map(code=>({code,word:state.parsed.map.get(code)||null}));
    $("manual-output").textContent=JSON.stringify({resolved,phrase:resolved.map(x=>x.word||`[${x.code}?]`).join(" ")},null,2);
  }

  async function verify() {
    if(!state.rawBytes)throw new Error("Load the exact wordlist file first.");
    const ok=await DicewareVerifier.verifyEd25519(state.rawBytes,$("verify-key").value,$("verify-sig").value);
    $("verify-output").textContent=JSON.stringify({algorithm:"Ed25519",valid:ok,filename:state.filename},null,2);
  }

  function audit() {
    const r=DicewareCore.auditRolls($("audit-rolls").value);
    $("audit-output").textContent=JSON.stringify({
      ...r,
      frequencies:r.frequencies.map(fmtPct),
      note:"Chi-square is reported as a diagnostic statistic; interpret significance with an appropriate statistical threshold and sample size."
    },null,2);
  }

  function normalizedList() {
    if(!state.parsed)throw new Error("Load a wordlist first.");
    return [...state.parsed.map.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([c,w])=>`${c}\t${w}`).join("\n")+"\n";
  }

  function printList() {
    if(!state.parsed)throw new Error("Load a wordlist first.");
    const rows=[...state.parsed.map.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([c,w])=>`<tr><td>${c}</td><td>${w.replace(/[&<>]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[m]))}</td></tr>`).join("");
    const win=window.open("","_blank");
    win.document.write(`<title>Diceware Wordlist</title><style>body{{font:10px monospace}}table{{columns:2}}td{{padding:1px 8px}}</style><h1>${state.filename}</h1><table>${rows}</table>`);
    win.document.close();win.print();
  }

  const dz=$("wordlist-drop");
  ["dragenter","dragover"].forEach(n=>dz.addEventListener(n,e=>{e.preventDefault();dz.classList.add("dragover");}));
  ["dragleave","drop"].forEach(n=>dz.addEventListener(n,e=>{e.preventDefault();dz.classList.remove("dragover");}));
  dz.addEventListener("drop",e=>{const f=e.dataTransfer.files?.[0];if(f)loadFile(f).catch(err=>alert(err.message));});
  $("wordlist-file").addEventListener("change",async()=>{const f=$("wordlist-file").files?.[0];if(f)await loadFile(f);$("wordlist-file").value="";});
  $("gen-run").addEventListener("click",()=>{try{generate();}catch(e){alert(e.message);}});
  $("gen-copy").addEventListener("click",()=>navigator.clipboard?.writeText($("gen-output").textContent.split("\n")[0]||""));
  $("manual-run").addEventListener("click",()=>{try{manual();}catch(e){alert(e.message);}});
  $("verify-run").addEventListener("click",()=>verify().catch(e=>$("verify-output").textContent=`ERROR: ${e.message}`));
  $("audit-run").addEventListener("click",audit);
  $("download-list").addEventListener("click",()=>{try{download(normalizedList(),`${state.filename}.normalized.txt`);}catch(e){alert(e.message);}});
  $("print-list").addEventListener("click",()=>{try{printList();}catch(e){alert(e.message);}});

  window.BeefsDiceware=Object.freeze({version:"1.0.0-web",loadText(text){state.rawText=String(text);state.rawBytes=new TextEncoder().encode(state.rawText);state.parsed=DicewareCore.parseWordlist(state.rawText);return state.parsed;},generate(count=6){if(!state.parsed?.valid)throw new Error("Valid wordlist required.");return DicewareCore.generate(state.parsed.map,count);},auditRolls:DicewareCore.auditRolls,getState(){return{loaded:Boolean(state.parsed),valid:Boolean(state.parsed?.valid),entries:state.parsed?.count||0};}});
  window.ZZXHooks?.emit("beefs-diceware-wordlists:ready",{version:"1.0.0-web"});
})();

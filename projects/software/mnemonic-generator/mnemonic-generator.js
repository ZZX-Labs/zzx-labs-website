(()=>{"use strict";
const $=id=>document.getElementById(id),MG=MnemonicGeneratorCore;
let wordlist=[],words=[],entropyHex="";
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
$("wordlist").onchange=async()=>{
 const f=$("wordlist").files[0];if(!f)return;
 const raw=(await f.text()).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 wordlist=[...new Set(raw)];
 $("wordlist-count").textContent=wordlist.length;
 $("wordlist-status").textContent=wordlist.length===2048?"2048-word list loaded.":"Loaded custom list; not automatically claimed BIP39-compatible.";
 $("wordlist").value="";
};
function generate(){
 const count=+$("word-count").value||12;
 if(!wordlist.length){$("output").textContent="Import a wordlist first. The web build intentionally does not fabricate or silently embed an unverified wallet wordlist.";return}
 words=MG.generateWords(wordlist,count);
 entropyHex=MG.hex(MG.randomBytes(Math.ceil((count*Math.log2(wordlist.length))/8)));
 renderWords();
 $("entropy-bits").textContent=MG.entropyEstimate(count,wordlist.length).toFixed(2);
 $("output").textContent=JSON.stringify({mode:"custom unbiased word selection",wordCount:count,wordlistSize:wordlist.length,estimatedSelectionEntropyBits:MG.entropyEstimate(count,wordlist.length),entropySampleHex:entropyHex,phrase:words.join(" "),bip39Compatibility:"not asserted by browser generator"},null,2)
}
function renderWords(){
 const e=$("words");e.replaceChildren();words.forEach((w,i)=>{const d=document.createElement("div");d.className="mnemonic-word";d.innerHTML=`<b>${String(i+1).padStart(2,"0")}</b>${esc(w)}`;e.append(d)});
 $("card-words").innerHTML=words.map((w,i)=>`<span>${String(i+1).padStart(2,"0")} ${esc(w)}</span>`).join("");
 $("card-meta").textContent=`${words.length} words · generated locally · ${new Date().toISOString()}`;
}
$("generate").onclick=generate;
$("passphrase").onclick=()=>{if(!wordlist.length){$("pass-output").textContent="Import a wordlist first.";return}$("pass-output").textContent=MG.generatePassphrase(wordlist,Math.max(2,+$("pass-count").value||6))};
$("clear").onclick=()=>{words=[];entropyHex="";$("words").replaceChildren();$("output").textContent="";$("pass-output").textContent="";$("card-words").replaceChildren();$("card-meta").textContent="cleared"};
$("copy").onclick=async()=>{if(!words.length)return;await navigator.clipboard.writeText(words.join(" "));$("copy-status").textContent="Copied to clipboard. Clear clipboard manually after use."};
$("print").onclick=()=>window.print();
$("export").onclick=()=>{if(!words.length)return;MG.download(`# Mnemonic card\n# Generated locally\n${words.map((w,i)=>`${String(i+1).padStart(2,"0")} ${w}`).join("\n")}\n`,"mnemonic-card.txt")};
window.MnemonicGenerator=Object.freeze({version:"0.1.0-web",secretStorage:false});
})();

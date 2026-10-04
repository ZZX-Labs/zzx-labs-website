(()=>{"use strict";const $=id=>document.getElementById(id),state={artifacts:{},last:null};
function dl(text,name,type="text/plain"){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),900)}
async function runRecipe(override=null){try{const steps=override||ChefCore.parseRecipe($("recipe").value);state.last=await ChefCore.recipe($("input").value,steps);$("output").value=state.last.output;$("trace").textContent=JSON.stringify({stats:ChefCore.stats($("input").value),trace:state.last.trace},null,2);return state.last}catch(e){$("trace").textContent=`ERROR: ${e.message}`;throw e}}
$("run").onclick=()=>runRecipe();document.querySelectorAll(".quick").forEach(b=>b.onclick=()=>{const r=[{op:b.dataset.op}];$("recipe").value=JSON.stringify(r,null,2);runRecipe(r)});$("swap").onclick=()=>{const t=$("input").value;$("input").value=$("output").value;$("output").value=t};$("clear").onclick=()=>{$("input").value="";$("output").value="";$("trace").textContent=""};

function script(){const cmd=$("command").value.trim()||"cyberchefbash",hash=$("hash-tool").value;const h=hash==="sha256sum"?"sha256sum | awk '{print $1}'":"shasum -a 256 | awk '{print $1}'";const code=`#!/usr/bin/env bash
set -euo pipefail

op="\${1:-}"
if [[ $# -gt 0 ]]; then shift; fi
if [[ $# -gt 0 ]]; then input="$*"; else input="$(cat)"; fi

case "$op" in
  hex) printf '%s' "$input" | od -An -tx1 | tr -d ' \\n' ;;
  base64) printf '%s' "$input" | base64 | tr -d '\\n' ;;
  sha256) printf '%s' "$input" | ${h} ;;
  url) python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.stdin.read(),safe=""))' <<<"$input" ;;
  *) printf '%s\\n' "usage: ${cmd} <hex|base64|sha256|url> [input]" >&2; exit 2 ;;
esac
`;state.artifacts["bin/"+cmd]=code;$("script-output").textContent=code;return code}
$("gen-script").onclick=script;
$("gen-pipelines").onclick=()=>{const c=$("command").value.trim()||"cyberchefbash";const x=`printf '%s' 'abc' | ${c} sha256
printf '%s' 'abc' | ${c} hex
${c} base64 'abc'
find . -type f -maxdepth 1 -print0 | while IFS= read -r -d '' f; do printf '%s  ' "$f"; ${c} sha256 < "$f"; done
`;state.artifacts["examples/pipelines.sh"]=x;$("pipeline-output").textContent=x};
$("gen-check").onclick=()=>{const x=`#!/usr/bin/env bash
set -euo pipefail
required=(bash base64 od tr awk)
missing=0
for tool in "\${required[@]}"; do
  if ! command -v "$tool" >/dev/null 2>&1; then printf 'missing: %s\\n' "$tool" >&2; missing=1; fi
done
exit "$missing"
`;state.artifacts["check-deps.sh"]=x;$("check-output").textContent=x};
$("export").onclick=()=>{script();const t=JSON.stringify({schema:"zzx.cyberchefbash.bundle.v1",artifacts:state.artifacts},null,2);dl(t,"cyberchefbash-bundle.json","application/json");$("export-output").textContent=t};script();

runRecipe();window.CyberChefBash=Object.freeze({version:"0.1.0-alpha-web",runRecipe:ChefCore.recipe,getArtifacts:()=>JSON.parse(JSON.stringify(state.artifacts))});window.ZZXHooks?.emit("cyberchefbash:ready",{version:"0.1.0-alpha-web"});})();

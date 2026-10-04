(()=>{"use strict";const $=id=>document.getElementById(id),state={artifacts:{},last:null};
function dl(text,name,type="text/plain"){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),900)}
async function runRecipe(override=null){try{const steps=override||ChefCore.parseRecipe($("recipe").value);state.last=await ChefCore.recipe($("input").value,steps);$("output").value=state.last.output;$("trace").textContent=JSON.stringify({stats:ChefCore.stats($("input").value),trace:state.last.trace},null,2);return state.last}catch(e){$("trace").textContent=`ERROR: ${e.message}`;throw e}}
$("run").onclick=()=>runRecipe();document.querySelectorAll(".quick").forEach(b=>b.onclick=()=>{const r=[{op:b.dataset.op}];$("recipe").value=JSON.stringify(r,null,2);runRecipe(r)});$("swap").onclick=()=>{const t=$("input").value;$("input").value=$("output").value;$("output").value=t};$("clear").onclick=()=>{$("input").value="";$("output").value="";$("trace").textContent=""};

function genModule(){const m=$("module").value.trim()||"cyberchef";const code=`try:
    import ubinascii as binascii
except ImportError:
    import binascii
try:
    import uhashlib as hashlib
except ImportError:
    import hashlib

def to_hex(data):
    if isinstance(data, str): data = data.encode()
    return binascii.hexlify(data).decode()

def from_hex(text):
    return binascii.unhexlify(text)

def to_base64(data):
    if isinstance(data, str): data = data.encode()
    return binascii.b2a_base64(data).strip().decode()

def from_base64(text):
    return binascii.a2b_base64(text)

def sha256(data):
    if isinstance(data, str): data = data.encode()
    h = hashlib.sha256()
    h.update(data)
    return binascii.hexlify(h.digest()).decode()
`;state.artifacts[m+".py"]=code;$("module-output").textContent=code;return code}
$("gen-module").onclick=genModule;
$("profile").onclick=()=>{const p={board:$("board").value,heapBudgetBytes:Math.max(16384,+$("heap").value||131072),chunkBytes:Math.max(32,Math.min(4096,+$("chunk").value||256)),transport:$("transport").value,networkRequired:false,streamingPreferred:true};state.artifacts["board-profile.json"]=JSON.stringify(p,null,2);$("board-output").textContent=JSON.stringify(p,null,2)};
$("gen-serial").onclick=()=>{const m=$("module").value.trim()||"cyberchef";const code=`import sys
import ${m}

OPS = {
    "hex": ${m}.to_hex,
    "base64": ${m}.to_base64,
    "sha256": ${m}.sha256,
}

while True:
    try:
        line = input("chef> ")
        if not line: continue
        if line in ("quit","exit"): break
        op, _, payload = line.partition(" ")
        fn = OPS.get(op)
        if fn is None:
            print("ERR unknown op")
            continue
        print(fn(payload))
    except Exception as exc:
        print("ERR", exc)
`;state.artifacts["main.py"]=code;$("serial-output").textContent=code};
$("export").onclick=()=>{genModule();const t=JSON.stringify({schema:"zzx.cyberchefmpy.bundle.v1",artifacts:state.artifacts},null,2);dl(t,"cyberchefmpy-bundle.json","application/json");$("export-output").textContent=t};genModule();

runRecipe();window.CyberChefMicroPython=Object.freeze({version:"0.1.0-alpha-web",runRecipe:ChefCore.recipe,getArtifacts:()=>JSON.parse(JSON.stringify(state.artifacts))});window.ZZXHooks?.emit("cyberchefmpy:ready",{version:"0.1.0-alpha-web"});})();

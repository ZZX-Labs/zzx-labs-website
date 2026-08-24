(()=>{"use strict";const $=id=>document.getElementById(id);const state={last:null,artifacts:{}};
function dl(text,name,type="text/plain"){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)}
async function runRecipe(override=null){try{const steps=override||ChefCore.parseRecipe($("recipe").value);state.last=await ChefCore.recipe($("input").value,steps);$("output").value=state.last.output;$("trace").textContent=JSON.stringify({stats:ChefCore.stats($("input").value),trace:state.last.trace},null,2);return state.last}catch(e){$("trace").textContent=`ERROR: ${e.message}`;throw e}}
$("run").onclick=()=>runRecipe();document.querySelectorAll(".quick").forEach(b=>b.onclick=()=>{const r=[{op:b.dataset.op}];$("recipe").value=JSON.stringify(r,null,2);runRecipe(r)});$("swap").onclick=()=>{const x=$("input").value;$("input").value=$("output").value;$("output").value=x};$("clear").onclick=()=>{$("input").value="";$("output").value="";$("trace").textContent=""};

function genPyx(){const m=$("module").value.trim()||"cyberchefcy",p=$("prefix").value.trim()||"cc",bounds=$("bounds").value;const code=`# cython: language_level=3, boundscheck=${bounds}, wraparound=False, cdivision=True
import base64, hashlib, urllib.parse

cpdef str ${p}_to_hex(bytes data):
    return data.hex()

cpdef bytes ${p}_from_hex(str text):
    return bytes.fromhex(text)

cpdef str ${p}_to_base64(bytes data):
    return base64.b64encode(data).decode("ascii")

cpdef bytes ${p}_from_base64(str text):
    return base64.b64decode(text, validate=True)

cpdef str ${p}_sha256(bytes data):
    return hashlib.sha256(data).hexdigest()

cpdef str ${p}_url_encode(str text):
    return urllib.parse.quote(text, safe="")
`;state.artifacts[`${m}.pyx`]=code;$("pyx-output").textContent=code;return code}
$("gen-pyx").onclick=genPyx;
$("gen-build").onclick=()=>{const m=$("module").value.trim()||"cyberchefcy",opt=$("opt").value,omp=$("openmp").value==="true";const pyproject=`[build-system]
requires = ["setuptools>=69", "wheel", "Cython>=3.0"]
build-backend = "setuptools.build_meta"
`;const setup=`from setuptools import Extension, setup
from Cython.Build import cythonize

extra_compile_args = ["-O${opt}"]${omp?' + ["-fopenmp"]':''}
extra_link_args = ${omp?'["-fopenmp"]':'[]'}

extensions = [Extension("${m}", ["${m}.pyx"],
    extra_compile_args=extra_compile_args,
    extra_link_args=extra_link_args)]

setup(name="${m}", version="0.1.0a0",
      ext_modules=cythonize(extensions,
      compiler_directives={"language_level": 3, "boundscheck": ${$("bounds").value==="true"?"True":"False"}, "wraparound": False}))
`;state.artifacts["pyproject.toml"]=pyproject;state.artifacts["setup.py"]=setup;genPyx();$("build-output").textContent=`--- pyproject.toml ---\n${pyproject}\n--- setup.py ---\n${setup}`};
$("vectors").onclick=async()=>{const v=[["toBase64","abc","YWJj"],["toHex","abc","616263"],["rot13","Hello","Uryyb"],["sha256","abc","ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"]],out=[];for(const [op,input,expected] of v){const actual=await ChefCore.op(op,input);out.push({op,input,expected,actual,pass:actual===expected})}state.artifacts["test-vectors.json"]=JSON.stringify(out,null,2);$("vectors-output").textContent=JSON.stringify(out,null,2)};
$("export").onclick=()=>{const t=JSON.stringify({schema:"zzx.cyberchefcy.bundle.v1",version:"0.1.0-alpha",artifacts:state.artifacts},null,2);dl(t,"cyberchefcy-bundle.json","application/json");$("export-output").textContent=t};

runRecipe();
window.CyberChefCython=Object.freeze({version:"0.1.0-alpha-web",runRecipe:ChefCore.recipe,getArtifacts:()=>JSON.parse(JSON.stringify(state.artifacts))});
window.ZZXHooks?.emit("cyberchefcy:ready",{version:"0.1.0-alpha-web"});
})();

(()=>{"use strict";
const $=id=>document.getElementById(id);
const state={last:null,artifacts:{}};
function dl(text,name,type="text/plain"){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)}
async function runRecipe(override=null){try{const steps=override||ChefCore.parseRecipe($("recipe").value);state.last=await ChefCore.recipe($("input").value,steps);$("output").value=state.last.output;$("trace").textContent=JSON.stringify({stats:ChefCore.stats($("input").value),trace:state.last.trace},null,2);return state.last}catch(e){$("trace").textContent=`ERROR: ${e.message}`;throw e}}
$("run").onclick=()=>runRecipe();
document.querySelectorAll(".quick").forEach(b=>b.onclick=()=>{const r=[{op:b.dataset.op}];$("recipe").value=JSON.stringify(r,null,2);runRecipe(r)});
$("swap").onclick=()=>{const x=$("input").value;$("input").value=$("output").value;$("output").value=x};
$("clear").onclick=()=>{$("input").value="";$("output").value="";$("trace").textContent=""};

function genR(){
 const pkg=$("pkg").value.trim()||"cyberchefr",p=$("prefix").value.trim()||"cc";
 const code=`# ${pkg} transform primitives
${p}_to_hex <- function(x) {
  vapply(enc2utf8(x), function(s) paste(sprintf("%02x", as.integer(charToRaw(s))), collapse=""), character(1))
}

${p}_from_hex <- function(x) {
  vapply(x, function(s) rawToChar(as.raw(strtoi(substring(s, seq(1, nchar(s), 2), seq(2, nchar(s), 2)), 16L))), character(1))
}

${p}_to_base64 <- function(x) {
  stopifnot(requireNamespace("openssl", quietly=TRUE))
  vapply(enc2utf8(x), function(s) openssl::base64_encode(charToRaw(s)), character(1))
}

${p}_from_base64 <- function(x) {
  stopifnot(requireNamespace("openssl", quietly=TRUE))
  vapply(x, function(s) rawToChar(openssl::base64_decode(s)), character(1))
}

${p}_sha256 <- function(x) {
  stopifnot(requireNamespace("openssl", quietly=TRUE))
  vapply(enc2utf8(x), function(s) as.character(openssl::sha256(charToRaw(s))), character(1))
}

${p}_url_encode <- function(x) vapply(x, utils::URLencode, character(1), reserved=TRUE)
${p}_url_decode <- function(x) vapply(x, utils::URLdecode, character(1))
`;
 state.artifacts["R/cyberchef.R"]=code;$("r-output").textContent=code;return code
}
$("gen-r").onclick=genR;

$("gen-data").onclick=()=>{
 const col=$("column").value.trim()||"payload",p=$("prefix").value.trim()||"cc",ops=$("ops").value.split(",").map(x=>x.trim()).filter(Boolean);
 const map={to_hex:`${p}_to_hex`,from_hex:`${p}_from_hex`,to_base64:`${p}_to_base64`,from_base64:`${p}_from_base64`,sha256:`${p}_sha256`,url_encode:`${p}_url_encode`,url_decode:`${p}_url_decode`};
 let expr=`df[["${col}"]]`;
 for(const op of ops){if(!map[op])continue;expr=`${map[op]}(${expr})`}
 const code=`# deterministic data.frame preprocessing
df <- read.csv("input.csv", stringsAsFactors=FALSE)
df[["${col}_transformed"]] <- ${expr}
write.csv(df, "output.csv", row.names=FALSE, na="")
`;
 state.artifacts["examples/preprocess.R"]=code;$("data-output").textContent=code
};

$("gen-package").onclick=()=>{
 const pkg=$("pkg").value.trim()||"cyberchefr",ver=$("pkg-version").value.trim()||"0.1.0.9000",rv=$("r-version").value.trim()||">= 4.3";
 const d=`Package: ${pkg}
Type: Package
Title: CyberChef-style transforms for R
Version: ${ver}
License: Apache License (CLA)
Encoding: UTF-8
Imports:
    openssl
Depends:
    R (${rv})
Suggests:
    testthat
`;
 const ns=`exportPattern("^cc_")\n`;
 state.artifacts["DESCRIPTION"]=d;state.artifacts["NAMESPACE"]=ns;genR();$("package-output").textContent=`--- DESCRIPTION ---\n${d}\n--- NAMESPACE ---\n${ns}`
};

$("vectors").onclick=async()=>{
 const vec=[["toBase64","abc","YWJj"],["toHex","abc","616263"],["sha256","abc","ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"]],out=[];
 for(const [op,input,expected] of vec){const actual=await ChefCore.op(op,input);out.push({op,input,expected,actual,pass:actual===expected})}
 const p=$("prefix").value.trim()||"cc";
 const test=`testthat::test_that("reference vectors", {
  testthat::expect_equal(${p}_to_base64("abc"), "YWJj")
  testthat::expect_equal(${p}_to_hex("abc"), "616263")
  testthat::expect_equal(${p}_sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
})
`;
 state.artifacts["tests/testthat/test-vectors.R"]=test;state.artifacts["vectors.json"]=JSON.stringify(out,null,2);$("vectors-output").textContent=JSON.stringify({results:out,testthat:"generated"},null,2)
};

$("export").onclick=()=>{const t=JSON.stringify({schema:"zzx.cyberchefr.bundle.v1",version:"0.1.0-alpha",artifacts:state.artifacts},null,2);dl(t,"cyberchefr-bundle.json","application/json");$("export-output").textContent=t};
genR();

runRecipe();
window.CyberChefR=Object.freeze({version:"0.1.0-alpha-web",runRecipe:ChefCore.recipe,getArtifacts:()=>JSON.parse(JSON.stringify(state.artifacts))});
window.ZZXHooks?.emit("cyberchefr:ready",{version:"0.1.0-alpha-web"});
})();

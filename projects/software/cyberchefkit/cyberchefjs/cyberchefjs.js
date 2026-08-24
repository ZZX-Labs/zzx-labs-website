(()=>{"use strict";
const $=id=>document.getElementById(id),state={last:null,artifacts:{}};
function dl(text,name,type="text/plain"){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
async function runRecipe(override=null){try{const steps=override||ChefCore.parseRecipe($("recipe").value);state.last=await ChefCore.recipe($("input").value,steps);$("output").value=state.last.output;$("trace").textContent=JSON.stringify({stats:ChefCore.stats($("input").value),trace:state.last.trace},null,2);return state.last}catch(e){$("trace").textContent=`ERROR: ${e.message}`;throw e}}
if($("run"))$("run").onclick=()=>runRecipe();
document.querySelectorAll(".quick").forEach(b=>b.onclick=()=>{const r=[{op:b.dataset.op}];$("recipe").value=JSON.stringify(r,null,2);runRecipe(r)});
if($("swap"))$("swap").onclick=()=>{const x=$("input").value;$("input").value=$("output").value;$("output").value=x};
if($("clear"))$("clear").onclick=()=>{$("input").value="";$("output").value="";$("trace").textContent=""};

function moduleCode(){
 const esm=$("format").value==="esm";
 const body=`const te = new TextEncoder();
const td = new TextDecoder();

const bytesToHex = bytes => [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");

function fromHex(input) {
  const s = String(input).replace(/\\s+/g, "");
  if (s.length % 2 || !/^[0-9a-f]*$/i.test(s)) throw new Error("invalid hex");
  return td.decode(Uint8Array.from(s.match(/../g) || [], x => parseInt(x, 16)));
}

function toBase64(input) {
  return Buffer.from(String(input), "utf8").toString("base64");
}

function fromBase64(input) {
  return Buffer.from(String(input), "base64").toString("utf8");
}

function toHex(input) {
  return Buffer.from(String(input), "utf8").toString("hex");
}

async function sha256(input) {
  const crypto = await import("node:crypto");
  return crypto.createHash("sha256").update(String(input), "utf8").digest("hex");
}

function urlEncode(input) { return encodeURIComponent(String(input)); }
function urlDecode(input) { return decodeURIComponent(String(input)); }
`;
 const ex=esm?`\nexport { fromHex, toBase64, fromBase64, toHex, sha256, urlEncode, urlDecode };\n`:`\nmodule.exports = { fromHex, toBase64, fromBase64, toHex, sha256, urlEncode, urlDecode };\n`;
 const code=body+ex;state.artifacts[esm?"src/index.mjs":"src/index.cjs"]=code;$("module-output").textContent=code;return code
}
$("gen-module").onclick=moduleCode;
$("gen-node").onclick=()=>{
 const name=$("package-name").value.trim()||"@zzx-labs/cyberchefjs",cmd=$("cli-name").value.trim()||"cyberchefjs",engine=$("node-engine").value.trim()||">=18",esm=$("format").value==="esm";
 const pkg={name,version:"0.1.0-alpha.0",license:"Apache-2.0",type:esm?"module":"commonjs",engines:{node:engine},bin:{[cmd]:"bin/cyberchefjs.js"},scripts:{test:"node --test",build:"webpack --config webpack.config.cjs"},devDependencies:{webpack:"^5.0.0","webpack-cli":"^5.0.0"}};
 const cli=`#!/usr/bin/env node
${esm?'import { toHex, toBase64, sha256 } from "../src/index.mjs";':'const { toHex, toBase64, sha256 } = require("../src/index.cjs");'}

const [op, ...rest] = process.argv.slice(2);
const input = rest.join(" ");
if (!op) { console.error("usage: ${cmd} <hex|base64|sha256> <input>"); process.exit(2); }

const run = async () => {
  if (op === "hex") console.log(toHex(input));
  else if (op === "base64") console.log(toBase64(input));
  else if (op === "sha256") console.log(await sha256(input));
  else { console.error("unknown operation"); process.exit(2); }
};
run();
`;
 state.artifacts["package.json"]=JSON.stringify(pkg,null,2);state.artifacts["bin/cyberchefjs.js"]=cli;moduleCode();$("node-output").textContent=`--- package.json ---\n${JSON.stringify(pkg,null,2)}\n--- bin/${cmd} ---\n${cli}`
};
$("gen-webpack").onclick=()=>{
 const g=$("global-name").value.trim()||"CyberChefJS",mode=$("webpack-mode").value,entry=$("format").value==="esm"?"./src/index.mjs":"./src/index.cjs";
 const cfg=`const path = require("node:path");

module.exports = {
  mode: "${mode}",
  entry: "${entry}",
  output: {
    filename: "cyberchefjs.min.js",
    path: path.resolve(__dirname, "dist"),
    library: { name: "${g}", type: "umd" },
    globalObject: "globalThis",
    clean: true
  }
};
`;
 const html=`<!doctype html>
<meta charset="utf-8">
<title>${g} Demo</title>
<textarea id="i">abc</textarea><button id="run">SHA-256</button><pre id="o"></pre>
<script src="./cyberchefjs.min.js"></script>
<script>document.getElementById("run").onclick=async()=>document.getElementById("o").textContent=await ${g}.sha256(document.getElementById("i").value);<\/script>
`;
 state.artifacts["webpack.config.cjs"]=cfg;state.artifacts["dist/index.html"]=html;$("browser-output").textContent=`--- webpack.config.cjs ---\n${cfg}\n--- dist/index.html ---\n${html}`
};
$("vectors").onclick=async()=>{
 const vec=[["toBase64","abc","YWJj"],["toHex","abc","616263"],["rot13","Hello","Uryyb"],["sha256","abc","ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"]],out=[];
 for(const [op,input,expected] of vec){const actual=await ChefCore.op(op,input);out.push({op,input,expected,actual,pass:actual===expected})}
 const test=`import test from "node:test";
import assert from "node:assert/strict";
import { toBase64, toHex, sha256 } from "../src/index.mjs";

test("reference vectors", async () => {
  assert.equal(toBase64("abc"), "YWJj");
  assert.equal(toHex("abc"), "616263");
  assert.equal(await sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});
`;
 state.artifacts["test/vectors.test.mjs"]=test;state.artifacts["vectors.json"]=JSON.stringify(out,null,2);$("vectors-output").textContent=JSON.stringify({results:out,nodeTest:"generated"},null,2)
};
$("export").onclick=()=>{const t=JSON.stringify({schema:"zzx.cyberchefjs.bundle.v1",version:"0.1.0-alpha",artifacts:state.artifacts},null,2);dl(t,"cyberchefjs-bundle.json","application/json");$("export-output").textContent=t};
moduleCode();

if($("run"))runRecipe();
window.CyberChefJS=Object.freeze({version:"0.1.0-alpha-web",runRecipe:ChefCore.recipe,getArtifacts:()=>JSON.parse(JSON.stringify(state.artifacts))});
window.ZZXHooks?.emit("cyberchefjs:ready",{version:"0.1.0-alpha-web"});
})();

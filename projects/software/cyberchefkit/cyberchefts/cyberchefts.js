(()=>{"use strict";const $=id=>document.getElementById(id),state={artifacts:{},last:null};
function dl(text,name,type="text/plain"){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),900)}
async function runRecipe(override=null){try{const steps=override||ChefCore.parseRecipe($("recipe").value);state.last=await ChefCore.recipe($("input").value,steps);$("output").value=state.last.output;$("trace").textContent=JSON.stringify({stats:ChefCore.stats($("input").value),trace:state.last.trace},null,2);return state.last}catch(e){$("trace").textContent=`ERROR: ${e.message}`;throw e}}
$("run").onclick=()=>runRecipe();document.querySelectorAll(".quick").forEach(b=>b.onclick=()=>{const r=[{op:b.dataset.op}];$("recipe").value=JSON.stringify(r,null,2);runRecipe(r)});$("swap").onclick=()=>{const t=$("input").value;$("input").value=$("output").value;$("output").value=t};$("clear").onclick=()=>{$("input").value="";$("output").value="";$("trace").textContent=""};

function genTS(){const code=`export type ChefOperation = "hex" | "base64" | "sha256" | "url";

export function toHex(input: string): string {
  return [...new TextEncoder().encode(input)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export function toBase64(input: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(input)));
}

export async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export function urlEncode(input: string): string { return encodeURIComponent(input); }

export async function transform(op: ChefOperation, input: string): Promise<string> {
  switch (op) {
    case "hex": return toHex(input);
    case "base64": return toBase64(input);
    case "sha256": return sha256(input);
    case "url": return urlEncode(input);
  }
}
`;state.artifacts["src/index.ts"]=code;$("ts-output").textContent=code;return code}
$("gen-ts").onclick=genTS;
$("gen-package").onclick=()=>{const name=$("package").value.trim()||"@zzx-labs/cyberchefts";const pkg={name,version:"0.1.0-alpha.0",type:"module",license:"Apache-2.0",main:"./dist/index.js",types:"./dist/index.d.ts",files:["dist"],scripts:{build:"tsc -p tsconfig.json",test:"node --test"},devDependencies:{typescript:"^5.6.0"}};const tsconfig={compilerOptions:{target:"ES2022",module:"ES2022",moduleResolution:"Bundler",declaration:true,outDir:"dist",strict:true,lib:["ES2022","DOM"],skipLibCheck:true},include:["src/**/*.ts"]};state.artifacts["package.json"]=JSON.stringify(pkg,null,2);state.artifacts["tsconfig.json"]=JSON.stringify(tsconfig,null,2);genTS();$("package-output").textContent=`${JSON.stringify(pkg,null,2)}\n${JSON.stringify(tsconfig,null,2)}`};
$("export").onclick=()=>{genTS();const t=JSON.stringify({schema:"zzx.cyberchefts.bundle.v1",artifacts:state.artifacts},null,2);dl(t,"cyberchefts-bundle.json","application/json");$("export-output").textContent=t};genTS();

runRecipe();window.CyberChefTypeScript=Object.freeze({version:"0.1.0-alpha-web",runRecipe:ChefCore.recipe,getArtifacts:()=>JSON.parse(JSON.stringify(state.artifacts))});window.ZZXHooks?.emit("cyberchefts:ready",{version:"0.1.0-alpha-web"});})();

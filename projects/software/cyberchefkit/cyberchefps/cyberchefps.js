(()=>{"use strict";const $=id=>document.getElementById(id),state={artifacts:{},last:null};
function dl(text,name,type="text/plain"){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),900)}
async function runRecipe(override=null){try{const steps=override||ChefCore.parseRecipe($("recipe").value);state.last=await ChefCore.recipe($("input").value,steps);$("output").value=state.last.output;$("trace").textContent=JSON.stringify({stats:ChefCore.stats($("input").value),trace:state.last.trace},null,2);return state.last}catch(e){$("trace").textContent=`ERROR: ${e.message}`;throw e}}
$("run").onclick=()=>runRecipe();document.querySelectorAll(".quick").forEach(b=>b.onclick=()=>{const r=[{op:b.dataset.op}];$("recipe").value=JSON.stringify(r,null,2);runRecipe(r)});$("swap").onclick=()=>{const t=$("input").value;$("input").value=$("output").value;$("output").value=t};$("clear").onclick=()=>{$("input").value="";$("output").value="";$("trace").textContent=""};

function module(){const m=$("module").value.trim()||"CyberChefPS";const psm=`function ConvertTo-ChefHex { param([Parameter(ValueFromPipeline=$true)][string]$InputObject) process { -join ([Text.Encoding]::UTF8.GetBytes($InputObject) | ForEach-Object ToString x2) } }
function ConvertTo-ChefBase64 { param([Parameter(ValueFromPipeline=$true)][string]$InputObject) process { [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($InputObject)) } }
function Get-ChefSHA256 { param([Parameter(ValueFromPipeline=$true)][string]$InputObject) process { $h=[Security.Cryptography.SHA256]::Create(); try { -join ($h.ComputeHash([Text.Encoding]::UTF8.GetBytes($InputObject)) | ForEach-Object ToString x2) } finally { $h.Dispose() } } }
function ConvertTo-ChefUrlEncoded { param([Parameter(ValueFromPipeline=$true)][string]$InputObject) process { [Uri]::EscapeDataString($InputObject) } }
Export-ModuleMember -Function ConvertTo-ChefHex,ConvertTo-ChefBase64,Get-ChefSHA256,ConvertTo-ChefUrlEncoded
`;const psd=`@{ RootModule='${m}.psm1'; ModuleVersion='0.1.0'; GUID='00000000-0000-0000-0000-000000000001'; Author='ZZX-Labs'; PowerShellVersion='7.0'; FunctionsToExport='*' }
`;state.artifacts[m+".psm1"]=psm;state.artifacts[m+".psd1"]=psd;$("module-output").textContent=`${psm}\n${psd}`;return psm}
$("gen-module").onclick=module;
$("examples").onclick=()=>{const m=$("module").value.trim()||"CyberChefPS";const x=`Import-Module .\\${m}.psd1
'abc' | ConvertTo-ChefHex
'abc' | ConvertTo-ChefBase64
'abc' | Get-ChefSHA256
Get-Content .\\payload.txt -Raw | Get-ChefSHA256
`;state.artifacts["examples.ps1"]=x;$("cli-output").textContent=x};
$("export").onclick=()=>{module();const t=JSON.stringify({schema:"zzx.cyberchefps.bundle.v1",artifacts:state.artifacts},null,2);dl(t,"cyberchefps-bundle.json","application/json");$("export-output").textContent=t};module();

runRecipe();window.CyberChefPowerShell=Object.freeze({version:"0.1.0-alpha-web",runRecipe:ChefCore.recipe,getArtifacts:()=>JSON.parse(JSON.stringify(state.artifacts))});window.ZZXHooks?.emit("cyberchefps:ready",{version:"0.1.0-alpha-web"});})();

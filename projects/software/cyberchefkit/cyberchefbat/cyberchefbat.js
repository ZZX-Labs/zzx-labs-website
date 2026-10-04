(()=>{"use strict";const $=id=>document.getElementById(id),state={artifacts:{},last:null};
function dl(text,name,type="text/plain"){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),900)}
async function runRecipe(override=null){try{const steps=override||ChefCore.parseRecipe($("recipe").value);state.last=await ChefCore.recipe($("input").value,steps);$("output").value=state.last.output;$("trace").textContent=JSON.stringify({stats:ChefCore.stats($("input").value),trace:state.last.trace},null,2);return state.last}catch(e){$("trace").textContent=`ERROR: ${e.message}`;throw e}}
$("run").onclick=()=>runRecipe();document.querySelectorAll(".quick").forEach(b=>b.onclick=()=>{const r=[{op:b.dataset.op}];$("recipe").value=JSON.stringify(r,null,2);runRecipe(r)});$("swap").onclick=()=>{const t=$("input").value;$("input").value=$("output").value;$("output").value=t};$("clear").onclick=()=>{$("input").value="";$("output").value="";$("trace").textContent=""};

function bat(){const c=$("command").value.trim()||"cyberchefbat";const x=`@echo off
setlocal EnableExtensions DisableDelayedExpansion
if "%~1"=="" goto :usage
set "OP=%~1"
shift
set "INPUT=%~1"

if /I "%OP%"=="hex" powershell -NoProfile -Command "$b=[Text.Encoding]::UTF8.GetBytes($env:INPUT); -join ($b|%% ToString x2)"
if /I "%OP%"=="base64" powershell -NoProfile -Command "[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($env:INPUT))"
if /I "%OP%"=="sha256" powershell -NoProfile -Command "$h=[Security.Cryptography.SHA256]::Create(); -join ($h.ComputeHash([Text.Encoding]::UTF8.GetBytes($env:INPUT))|%% ToString x2)"
if /I "%OP%"=="url" powershell -NoProfile -Command "[Uri]::EscapeDataString($env:INPUT)"
if /I "%OP%"=="hex" exit /b 0
if /I "%OP%"=="base64" exit /b 0
if /I "%OP%"=="sha256" exit /b 0
if /I "%OP%"=="url" exit /b 0

:usage
>&2 echo usage: ${c} ^<hex^|base64^|sha256^|url^> "input"
exit /b 2
`;state.artifacts[c+".bat"]=x;$("batch-output").textContent=x;return x}
$("gen-bat").onclick=bat;
$("examples").onclick=()=>{const c=$("command").value.trim()||"cyberchefbat";const x=`${c}.bat sha256 "abc"
${c}.bat hex "abc"
${c}.bat base64 "abc"
for %%F in (*.txt) do @echo %%F & certutil -hashfile "%%F" SHA256
`;state.artifacts["examples.txt"]=x;$("examples-output").textContent=x};
$("check").onclick=()=>{const x=`@echo off
where cmd.exe >nul 2>nul || exit /b 1
where powershell.exe >nul 2>nul || (
  >&2 echo PowerShell is required for hashing and encoding primitives.
  exit /b 1
)
echo environment ok
`;state.artifacts["check-env.bat"]=x;$("check-output").textContent=x};
$("export").onclick=()=>{bat();const t=JSON.stringify({schema:"zzx.cyberchefbat.bundle.v1",artifacts:state.artifacts},null,2);dl(t,"cyberchefbat-bundle.json","application/json");$("export-output").textContent=t};bat();

runRecipe();window.CyberChefBAT=Object.freeze({version:"0.1.0-alpha-web",runRecipe:ChefCore.recipe,getArtifacts:()=>JSON.parse(JSON.stringify(state.artifacts))});window.ZZXHooks?.emit("cyberchefbat:ready",{version:"0.1.0-alpha-web"});})();

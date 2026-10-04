(()=>{"use strict";const $=id=>document.getElementById(id);const state={last:null,artifacts:{}};
function dl(text,name,type="text/plain"){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)}
async function runRecipe(override=null){try{const steps=override||ChefCore.parseRecipe($("recipe").value);state.last=await ChefCore.recipe($("input").value,steps);$("output").value=state.last.output;$("trace").textContent=JSON.stringify({stats:ChefCore.stats($("input").value),trace:state.last.trace},null,2);return state.last}catch(e){$("trace").textContent=`ERROR: ${e.message}`;throw e}}
$("run").onclick=()=>runRecipe();document.querySelectorAll(".quick").forEach(b=>b.onclick=()=>{const r=[{op:b.dataset.op}];$("recipe").value=JSON.stringify(r,null,2);runRecipe(r)});$("swap").onclick=()=>{const x=$("input").value;$("input").value=$("output").value;$("output").value=x};$("clear").onclick=()=>{$("input").value="";$("output").value="";$("trace").textContent=""};

function genCS(){const ns=$("namespace").value.trim()||"ZZXLabs.CyberChef",cl=$("class").value.trim()||"CyberChef";const code=`using System;
using System.Net;
using System.Security.Cryptography;
using System.Text;

namespace ${ns};

public static class ${cl}
{
    public static string ToHex(string input) =>
        Convert.ToHexString(Encoding.UTF8.GetBytes(input)).ToLowerInvariant();

    public static string FromHex(string hex) =>
        Encoding.UTF8.GetString(Convert.FromHexString(hex));

    public static string ToBase64(string input) =>
        Convert.ToBase64String(Encoding.UTF8.GetBytes(input));

    public static string FromBase64(string input) =>
        Encoding.UTF8.GetString(Convert.FromBase64String(input));

    public static string Sha256(string input) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(input))).ToLowerInvariant();

    public static string UrlEncode(string input) => WebUtility.UrlEncode(input);
    public static string UrlDecode(string input) => WebUtility.UrlDecode(input);
}
`;state.artifacts["CyberChef.cs"]=code;$("cs-output").textContent=code;return code}
$("gen-cs").onclick=genCS;
$("gen-project").onclick=()=>{const tfm=$("tfm").value,out=$("output-type").value,trim=$("trim").value;const proj=`<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>${out}</OutputType>
    <TargetFramework>${tfm}</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>${$("nullable").value}</Nullable>
    <PublishTrimmed>${trim}</PublishTrimmed>
  </PropertyGroup>
</Project>
`;const program=`using ${$("namespace").value.trim()||"ZZXLabs.CyberChef"};

if (args.Length < 2)
{
    Console.Error.WriteLine("usage: cyberchefcsharp <hex|base64|sha256> <input>");
    return 2;
}

Console.WriteLine(args[0] switch
{
    "hex" => CyberChef.ToHex(args[1]),
    "base64" => CyberChef.ToBase64(args[1]),
    "sha256" => CyberChef.Sha256(args[1]),
    _ => throw new ArgumentException("unknown operation")
});
return 0;
`;state.artifacts["CyberChefCSharp.csproj"]=proj;state.artifacts["Program.cs"]=program;genCS();$("project-output").textContent=`--- CyberChefCSharp.csproj ---\n${proj}\n--- Program.cs ---\n${program}`};
$("vectors").onclick=async()=>{const vectors=[["toBase64","abc","YWJj"],["toHex","abc","616263"],["sha256","abc","ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"]],results=[];for(const [op,input,expected] of vectors){const actual=await ChefCore.op(op,input);results.push({op,input,expected,actual,pass:actual===expected})}const tests=`using Xunit;
using ${$("namespace").value.trim()||"ZZXLabs.CyberChef"};

public class CyberChefTests
{
    [Fact] public void Base64Vector() => Assert.Equal("YWJj", CyberChef.ToBase64("abc"));
    [Fact] public void HexVector() => Assert.Equal("616263", CyberChef.ToHex("abc"));
    [Fact] public void Sha256Vector() => Assert.Equal("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", CyberChef.Sha256("abc"));
}
`;state.artifacts["CyberChefTests.cs"]=tests;state.artifacts["vectors.json"]=JSON.stringify(results,null,2);$("vectors-output").textContent=JSON.stringify({results,generatedTestFile:"CyberChefTests.cs"},null,2)};
$("export").onclick=()=>{const t=JSON.stringify({schema:"zzx.cyberchefcsharp.bundle.v1",version:"0.1.0-alpha",artifacts:state.artifacts},null,2);dl(t,"cyberchefcsharp-bundle.json","application/json");$("export-output").textContent=t};

runRecipe();
window.CyberChefCSharp=Object.freeze({version:"0.1.0-alpha-web",runRecipe:ChefCore.recipe,getArtifacts:()=>JSON.parse(JSON.stringify(state.artifacts))});
window.ZZXHooks?.emit("cyberchefcsharp:ready",{version:"0.1.0-alpha-web"});
})();

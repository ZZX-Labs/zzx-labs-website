(()=>{"use strict";const $=id=>document.getElementById(id),state={artifacts:{},last:null};
function dl(text,name,type="text/plain"){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),900)}
async function runRecipe(override=null){try{const steps=override||ChefCore.parseRecipe($("recipe").value);state.last=await ChefCore.recipe($("input").value,steps);$("output").value=state.last.output;$("trace").textContent=JSON.stringify({stats:ChefCore.stats($("input").value),trace:state.last.trace},null,2);return state.last}catch(e){$("trace").textContent=`ERROR: ${e.message}`;throw e}}
$("run").onclick=()=>runRecipe();document.querySelectorAll(".quick").forEach(b=>b.onclick=()=>{const r=[{op:b.dataset.op}];$("recipe").value=JSON.stringify(r,null,2);runRecipe(r)});$("swap").onclick=()=>{const t=$("input").value;$("input").value=$("output").value;$("output").value=t};$("clear").onclick=()=>{$("input").value="";$("output").value="";$("trace").textContent=""};

function swift(){const mod=$("module").value.trim()||"CyberChefSwift";const lib=`import Foundation
import CryptoKit

public enum CyberChef {
    public static func toHex(_ input: String) -> String {
        Data(input.utf8).map { String(format: "%02x", $0) }.joined()
    }

    public static func toBase64(_ input: String) -> String {
        Data(input.utf8).base64EncodedString()
    }

    public static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    public static func urlEncode(_ input: String) -> String {
        input.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? input
    }
}
`;const cli=`import Foundation
import ${mod}

let args = Array(CommandLine.arguments.dropFirst())
guard args.count >= 2 else { fputs("usage: cyberchefswift <hex|base64|sha256> <input>\\n", stderr); exit(2) }
switch args[0] {
case "hex": print(CyberChef.toHex(args[1]))
case "base64": print(CyberChef.toBase64(args[1]))
case "sha256": print(CyberChef.sha256(args[1]))
default: fputs("unknown operation\\n", stderr); exit(2)
}
`;state.artifacts["Sources/"+mod+"/CyberChef.swift"]=lib;state.artifacts["Sources/cyberchefswift/main.swift"]=cli;$("swift-output").textContent=`${lib}\n${cli}`;return lib}
$("gen-swift").onclick=swift;
$("gen-package").onclick=()=>{const mod=$("module").value.trim()||"CyberChefSwift",mac=$("mac").value,ios=$("ios").value;const x=`// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "${mod}",
    platforms: [.macOS(.v${mac}), .iOS(.v${ios})],
    products: [
        .library(name: "${mod}", targets: ["${mod}"]),
        .executable(name: "cyberchefswift", targets: ["cyberchefswift"])
    ],
    targets: [
        .target(name: "${mod}"),
        .executableTarget(name: "cyberchefswift", dependencies: ["${mod}"]),
        .testTarget(name: "${mod}Tests", dependencies: ["${mod}"])
    ]
)
`;state.artifacts["Package.swift"]=x;swift();$("package-output").textContent=x};
$("export").onclick=()=>{swift();const t=JSON.stringify({schema:"zzx.cyberchefswift.bundle.v1",artifacts:state.artifacts},null,2);dl(t,"cyberchefswift-bundle.json","application/json");$("export-output").textContent=t};swift();

runRecipe();window.CyberChefSwift=Object.freeze({version:"0.1.0-alpha-web",runRecipe:ChefCore.recipe,getArtifacts:()=>JSON.parse(JSON.stringify(state.artifacts))});window.ZZXHooks?.emit("cyberchefswift:ready",{version:"0.1.0-alpha-web"});})();

(()=>{"use strict";const $=id=>document.getElementById(id);const state={last:null,artifacts:{}};
function dl(text,name,type="text/plain"){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)}
async function runRecipe(override=null){try{const steps=override||ChefCore.parseRecipe($("recipe").value);state.last=await ChefCore.recipe($("input").value,steps);$("output").value=state.last.output;$("trace").textContent=JSON.stringify({stats:ChefCore.stats($("input").value),trace:state.last.trace},null,2);return state.last}catch(e){$("trace").textContent=`ERROR: ${e.message}`;throw e}}
$("run").onclick=()=>runRecipe();document.querySelectorAll(".quick").forEach(b=>b.onclick=()=>{const r=[{op:b.dataset.op}];$("recipe").value=JSON.stringify(r,null,2);runRecipe(r)});$("swap").onclick=()=>{const x=$("input").value;$("input").value=$("output").value;$("output").value=x};$("clear").onclick=()=>{$("input").value="";$("output").value="";$("trace").textContent=""};

function genGo(){const module=$("module").value.trim()||"github.com/ZZX-Labs/cyberchefgo",pkg=$("package").value.trim()||"cyberchef",gov=$("go-version").value.trim()||"1.24";const gomod=`module ${module}

go ${gov}
`;const lib=`package ${pkg}

import (
    "crypto/sha256"
    "encoding/base64"
    "encoding/hex"
    "net/url"
)

func ToHex(input string) string { return hex.EncodeToString([]byte(input)) }
func FromHex(input string) (string, error) { b, err := hex.DecodeString(input); if err != nil { return "", err }; return string(b), nil }
func ToBase64(input string) string { return base64.StdEncoding.EncodeToString([]byte(input)) }
func FromBase64(input string) (string, error) { b, err := base64.StdEncoding.DecodeString(input); if err != nil { return "", err }; return string(b), nil }
func SHA256(input string) string { sum := sha256.Sum256([]byte(input)); return hex.EncodeToString(sum[:]) }
func URLEncode(input string) string { return url.QueryEscape(input) }
`;const cli=`package main

import (
    "fmt"
    "os"
    chef "${module}"
)

func main() {
    if len(os.Args) < 3 { fmt.Fprintln(os.Stderr, "usage: cyberchefgo <hex|base64|sha256> <input>"); os.Exit(2) }
    switch os.Args[1] {
    case "hex": fmt.Println(chef.ToHex(os.Args[2]))
    case "base64": fmt.Println(chef.ToBase64(os.Args[2]))
    case "sha256": fmt.Println(chef.SHA256(os.Args[2]))
    default: fmt.Fprintln(os.Stderr, "unknown operation"); os.Exit(2)
    }
}
`;state.artifacts["go.mod"]=gomod;state.artifacts["cyberchef.go"]=lib;state.artifacts["cmd/cyberchefgo/main.go"]=cli;$("go-output").textContent=`--- go.mod ---\n${gomod}\n--- cyberchef.go ---\n${lib}\n--- cmd/cyberchefgo/main.go ---\n${cli}`};
$("gen-go").onclick=genGo;
$("gen-service").onclick=()=>{const addr=$("listen").value.trim()||"127.0.0.1:8080",max=Math.max(1024,+$("max-bytes").value||1048576),cors=$("cors").checked,module=$("module").value.trim()||"github.com/ZZX-Labs/cyberchefgo";const service=`package main

import (
    "encoding/json"
    "io"
    "net/http"
    chef "${module}"
)

type request struct { Op string \`json:"op"\`; Input string \`json:"input"\` }
type response struct { Output string \`json:"output"\` }

func main() {
    mux := http.NewServeMux()
    mux.HandleFunc("/v1/transform", func(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodPost { http.Error(w, "POST required", http.StatusMethodNotAllowed); return }
        r.Body = http.MaxBytesReader(w, r.Body, ${max})
        b, err := io.ReadAll(r.Body); if err != nil { http.Error(w, err.Error(), 400); return }
        var q request; if err := json.Unmarshal(b, &q); err != nil { http.Error(w, err.Error(), 400); return }
        var out string
        switch q.Op {
        case "hex": out = chef.ToHex(q.Input)
        case "base64": out = chef.ToBase64(q.Input)
        case "sha256": out = chef.SHA256(q.Input)
        default: http.Error(w, "unknown operation", 400); return
        }
        ${cors?'w.Header().Set("Access-Control-Allow-Origin", "*")':'// CORS disabled by default'}
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(response{Output: out})
    })
    http.ListenAndServe("${addr}", mux)
}
`;state.artifacts["cmd/cyberchefgo-server/main.go"]=service;$("service-output").textContent=service};
$("vectors").onclick=async()=>{const vec=[["toBase64","abc","YWJj"],["toHex","abc","616263"],["sha256","abc","ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"]],out=[];for(const [op,input,expected] of vec){const actual=await ChefCore.op(op,input);out.push({op,input,expected,actual,pass:actual===expected})}state.artifacts["vectors.json"]=JSON.stringify(out,null,2);$("build-output").textContent=JSON.stringify(out,null,2)};
$("gen-build").onclick=()=>{const x={commands:["go test ./...","go vet ./...","go build -trimpath -ldflags=-s -w ./cmd/cyberchefgo","GOOS=linux GOARCH=amd64 go build ./cmd/cyberchefgo","GOOS=windows GOARCH=amd64 go build ./cmd/cyberchefgo","GOOS=darwin GOARCH=arm64 go build ./cmd/cyberchefgo"],note:"Cross-build examples only; browser does not compile Go."};state.artifacts["build-matrix.json"]=JSON.stringify(x,null,2);$("build-output").textContent=JSON.stringify(x,null,2)};
$("export").onclick=()=>{const t=JSON.stringify({schema:"zzx.cyberchefgo.bundle.v1",version:"0.1.0-alpha",artifacts:state.artifacts},null,2);dl(t,"cyberchefgo-bundle.json","application/json");$("export-output").textContent=t};genGo();

runRecipe();
window.CyberChefGo=Object.freeze({version:"0.1.0-alpha-web",runRecipe:ChefCore.recipe,getArtifacts:()=>JSON.parse(JSON.stringify(state.artifacts))});
window.ZZXHooks?.emit("cyberchefgo:ready",{version:"0.1.0-alpha-web"});
})();

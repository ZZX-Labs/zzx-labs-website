(()=>{"use strict";const $=id=>document.getElementById(id);const state={last:null,artifacts:{}};
function dl(text,name,type="text/plain"){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)}
async function runRecipe(override=null){try{const steps=override||ChefCore.parseRecipe($("recipe").value);state.last=await ChefCore.recipe($("input").value,steps);$("output").value=state.last.output;$("trace").textContent=JSON.stringify({stats:ChefCore.stats($("input").value),trace:state.last.trace},null,2);return state.last}catch(e){$("trace").textContent=`ERROR: ${e.message}`;throw e}}
$("run").onclick=()=>runRecipe();document.querySelectorAll(".quick").forEach(b=>b.onclick=()=>{const r=[{op:b.dataset.op}];$("recipe").value=JSON.stringify(r,null,2);runRecipe(r)});$("swap").onclick=()=>{const x=$("input").value;$("input").value=$("output").value;$("output").value=x};$("clear").onclick=()=>{$("input").value="";$("output").value="";$("trace").textContent=""};

function genRust(){const crate=$("crate").value.trim()||"cyberchefrs",edition=$("edition").value;const cargo=`[package]
name = "${crate}"
version = "0.1.0-alpha.0"
edition = "${edition}"
license = "Apache-2.0"

[dependencies]
base64 = "0.22"
hex = "0.4"
sha2 = "0.10"
urlencoding = "2"
`;const lib=`use base64::{engine::general_purpose::STANDARD, Engine as _};
use sha2::{Digest, Sha256};

pub fn to_hex(input: &str) -> String { hex::encode(input.as_bytes()) }
pub fn from_hex(input: &str) -> Result<String, String> {
    let bytes = hex::decode(input).map_err(|e| e.to_string())?;
    String::from_utf8(bytes).map_err(|e| e.to_string())
}
pub fn to_base64(input: &str) -> String { STANDARD.encode(input.as_bytes()) }
pub fn from_base64(input: &str) -> Result<String, String> {
    let bytes = STANDARD.decode(input).map_err(|e| e.to_string())?;
    String::from_utf8(bytes).map_err(|e| e.to_string())
}
pub fn sha256(input: &str) -> String {
    let mut h = Sha256::new(); h.update(input.as_bytes()); hex::encode(h.finalize())
}
pub fn url_encode(input: &str) -> String { urlencoding::encode(input).into_owned() }
`;const main=`use ${crate.replace(/-/g,"_")}::{sha256, to_base64, to_hex};

fn main() {
    let mut args = std::env::args().skip(1);
    let op = args.next().unwrap_or_default();
    let input = args.next().unwrap_or_default();
    let out = match op.as_str() {
        "hex" => to_hex(&input),
        "base64" => to_base64(&input),
        "sha256" => sha256(&input),
        _ => { eprintln!("usage: cyberchefrs <hex|base64|sha256> <input>"); std::process::exit(2); }
    };
    println!("{out}");
}
`;state.artifacts["Cargo.toml"]=cargo;state.artifacts["src/lib.rs"]=lib;state.artifacts["src/main.rs"]=main;$("rust-output").textContent=`--- Cargo.toml ---\n${cargo}\n--- src/lib.rs ---\n${lib}\n--- src/main.rs ---\n${main}`;return{cargo,lib,main}}
$("gen-rust").onclick=genRust;
$("gen-wasm").onclick=()=>{const crate=$("crate").value.trim()||"cyberchefrs",name=$("wasm-name").value.trim()||"cyberchefrs_wasm",target=$("wasm-target").value;const cargo=`[package]
name = "${name}"
version = "0.1.0-alpha.0"
edition = "2024"

[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2"
${crate.replace(/-/g,"_")} = { path = ".." }
`;const lib=`use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn to_hex(input: &str) -> String { ${crate.replace(/-/g,"_")}::to_hex(input) }

#[wasm_bindgen]
pub fn to_base64(input: &str) -> String { ${crate.replace(/-/g,"_")}::to_base64(input) }

#[wasm_bindgen]
pub fn sha256(input: &str) -> String { ${crate.replace(/-/g,"_")}::sha256(input) }
`;const cmd=`rustup target add wasm32-unknown-unknown
cargo build --release --target wasm32-unknown-unknown
wasm-bindgen --target ${target} --out-dir pkg target/wasm32-unknown-unknown/release/${name}.wasm
`;state.artifacts["wasm/Cargo.toml"]=cargo;state.artifacts["wasm/src/lib.rs"]=lib;state.artifacts["wasm/build.txt"]=cmd;$("wasm-output").textContent=`--- wasm/Cargo.toml ---\n${cargo}\n--- wasm/src/lib.rs ---\n${lib}\n--- build ---\n${cmd}`};
$("vectors").onclick=async()=>{const vec=[["toBase64","abc","YWJj"],["toHex","abc","616263"],["sha256","abc","ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"]],out=[];for(const [op,input,expected] of vec){const actual=await ChefCore.op(op,input);out.push({op,input,expected,actual,pass:actual===expected})}state.artifacts["vectors.json"]=JSON.stringify(out,null,2);$("build-output").textContent=JSON.stringify(out,null,2)};
$("build-matrix").onclick=()=>{const x={commands:["cargo fmt --check","cargo clippy --all-targets --all-features -- -D warnings","cargo test","cargo build --release","rustup target add wasm32-unknown-unknown","cargo build --release --target wasm32-unknown-unknown"],note:"Browser does not compile native or WASM binaries."};state.artifacts["build-matrix.json"]=JSON.stringify(x,null,2);$("build-output").textContent=JSON.stringify(x,null,2)};
$("export").onclick=()=>{const t=JSON.stringify({schema:"zzx.cyberchefrust.bundle.v1",version:"0.1.0-alpha",artifacts:state.artifacts},null,2);dl(t,"cyberchefrs-bundle.json","application/json");$("export-output").textContent=t};genRust();

runRecipe();
window.CyberChefRust=Object.freeze({version:"0.1.0-alpha-web",runRecipe:ChefCore.recipe,getArtifacts:()=>JSON.parse(JSON.stringify(state.artifacts))});
window.ZZXHooks?.emit("cyberchefrust:ready",{version:"0.1.0-alpha-web"});
})();

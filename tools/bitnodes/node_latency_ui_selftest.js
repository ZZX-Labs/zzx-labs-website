const fs=require("fs");
const path=require("path");
function assert(ok,msg){if(!ok)throw new Error(msg)}

const root=path.resolve(__dirname,"../..");
const dir=path.join(root,"__partials/widgets/node-latency");

const html=fs.readFileSync(path.join(dir,"widget.html"),"utf8");
const css=fs.readFileSync(path.join(dir,"widget.css"),"utf8");
const js=fs.readFileSync(path.join(dir,"widget.js"),"utf8");

for(const attr of [
  "data-node-latency-coverage-label",
  "data-node-latency-bucket-fast",
  "data-node-latency-bucket-very-slow",
  "data-node-latency-body",
  "data-node-latency-scroll",
  "data-node-latency-invalid",
  "data-node-latency-mode"
]){
  assert(html.includes(attr),`missing ${attr}`);
}

assert(css.includes("position:sticky"),"sticky network header missing");
assert(css.includes("max-height:250px"),"bounded network table missing");
assert(css.includes("node-latency__bucket"),"bucket styling missing");
assert(js.includes("ZZXNodeLatencyUI.renderNetworkRows"),"UI module not wired");
assert(js.includes("ZZXNodeLatencyViewport.attach"),"viewport module not wired");
assert(js.includes('m.mode==="per-node"'),"per-node/aggregate mode distinction missing");
assert(js.includes("no synthetic latency"),"source semantics note missing");

console.log("node_latency_ui_selftest: PASS");

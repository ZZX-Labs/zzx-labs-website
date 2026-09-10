const fs=require("fs");
const path=require("path");
function assert(ok,msg){if(!ok)throw new Error(msg)}

const root=path.resolve(__dirname,"../..");
const dir=path.join(root,"__partials/widgets/nodes");
const html=fs.readFileSync(path.join(dir,"widget.html"),"utf8");
const css=fs.readFileSync(path.join(dir,"widget.css"),"utf8");
const js=fs.readFileSync(path.join(dir,"widget.js"),"utf8");
const fetch=fs.readFileSync(path.join(dir,"js/fetch.js"),"utf8");
const provider=fs.readFileSync(path.join(dir,"js/provider.js"),"utf8");
const sources=fs.readFileSync(path.join(dir,"js/sources.js"),"utf8");

for(const attr of [
  "data-nodes-dominant",
  "data-nodes-network-coverage",
  "data-nodes-stack-ipv4",
  "data-nodes-stack-tor",
  "data-nodes-geo-coverage",
  "data-nodes-asn-coverage",
  "data-nodes-latency-coverage",
  "data-nodes-height-coverage",
  "data-nodes-geo-joins",
  "data-nodes-asn-groups"
]){
  assert(html.includes(attr),`missing ${attr}`);
}

assert(css.includes("nodes__network-stack"),"network stack styling missing");
assert(css.includes("nodes__coverage"),"coverage styling missing");
assert(js.includes("ZZXNodesModel.build"),"model not wired");
assert(js.includes("ZZXNodesProvider.load"),"provider not wired");
assert(js.includes("ZZXNodesViewport.attach"),"viewport not wired");
assert(js.includes("ZZXNodesChart"),"chart not wired");

for(const text of [fetch,provider,sources]){
  assert(!text.includes("allorigins.win"),"AllOrigins must be removed");
  assert(!text.includes("btcnodes.io/api"),"direct btcnodes.io API must be removed");
  assert(!text.includes("bitnodes.io"),"defunct bitnodes.io must be removed");
}

console.log("nodes_ui_architecture_selftest: PASS");

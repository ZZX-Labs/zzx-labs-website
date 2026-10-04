const fs=require("fs");
const path=require("path");
function assert(ok,msg){if(!ok)throw new Error(msg)}

const root=path.resolve(__dirname,"../..");
const dir=path.join(root,"__partials/widgets/node-network-mix");
const html=fs.readFileSync(path.join(dir,"widget.html"),"utf8");
const css=fs.readFileSync(path.join(dir,"widget.css"),"utf8");
const js=fs.readFileSync(path.join(dir,"widget.js"),"utf8");

for(const attr of [
  "data-node-network-mix-coverage-label",
  "data-node-network-mix-bars",
  "data-node-network-mix-body",
  "data-node-network-mix-scroll",
  "data-node-network-mix-stack-ipv4",
  "data-node-network-mix-stack-tor",
  "data-node-network-mix-unclassified"
]){
  assert(html.includes(attr),`missing ${attr}`);
}

assert(css.includes("position:sticky"),"sticky matrix header missing");
assert(css.includes("max-height:230px"),"bounded matrix missing");
assert(css.includes("node-network-mix__stack"),"stacked mix bar styling missing");
assert(css.includes("node-network-mix__bar"),"ranked bar styling missing");
assert(js.includes("ZZXNodeNetworkMixUI.renderBars"),"bar UI module not used");
assert(js.includes("ZZXNodeNetworkMixUI.renderRows"),"table UI module not used");
assert(js.includes("ZZXNodeNetworkMixViewport.attach"),"viewport module not used");

console.log("node_network_mix_ui_selftest: PASS");

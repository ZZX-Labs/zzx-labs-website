const fs=require("fs");
const path=require("path");
function assert(ok,msg){if(!ok)throw new Error(msg)}

const root=path.resolve(__dirname,"../..");
const dir=path.join(root,"__partials/widgets/node-health");
const html=fs.readFileSync(path.join(dir,"widget.html"),"utf8");
const css=fs.readFileSync(path.join(dir,"widget.css"),"utf8");
const js=fs.readFileSync(path.join(dir,"widget.js"),"utf8");

for(const attr of [
  "data-node-health-height-coverage",
  "data-node-health-now-coverage",
  "data-node-health-24h-coverage",
  "data-node-health-lag-synced",
  "data-node-health-lag-minor",
  "data-node-health-lagging",
  "data-node-health-stale",
  "data-node-health-body",
  "data-node-health-scroll"
]){
  assert(html.includes(attr),`missing ${attr}`);
}

assert(css.includes("position:sticky"),"sticky network header missing");
assert(css.includes("max-height:250px"),"bounded network table missing");
assert(js.includes("ZZXNodeHealthUI.renderNetworkRows"),"UI module not wired");
assert(js.includes("ZZXNodeHealthViewport.attach"),"viewport module not wired");
assert(js.includes('m.nowObserved>0'),"reachability availability distinction missing");
assert(!js.includes('health.reachableNow)>0?health.reachableNow:reachable'),"old fallback semantics still present");

console.log("node_health_ui_selftest: PASS");

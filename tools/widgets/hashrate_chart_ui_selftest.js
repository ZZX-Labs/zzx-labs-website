const fs=require("fs");
const path=require("path");
function assert(ok,msg){if(!ok)throw new Error(msg)}

const root=path.resolve(__dirname,"../..");
const dir=path.join(root,"__partials/widgets/hashrate");

const html=fs.readFileSync(path.join(dir,"widget.html"),"utf8");
const css=fs.readFileSync(path.join(dir,"widget.css"),"utf8");
const js=fs.readFileSync(path.join(dir,"widget.js"),"utf8");
const provider=fs.readFileSync(path.join(dir,"js/provider.js"),"utf8");
const chart=fs.readFileSync(path.join(dir,"js/chart.js"),"utf8");

for(const attr of [
  "data-hr-average",
  "data-hr-high",
  "data-hr-low",
  "data-hr-change",
  "data-hr-range=\"1m\"",
  "data-hr-range=\"3m\"",
  "data-hr-range=\"6m\"",
  "data-hr-range=\"1y\"",
  "data-hr-grid",
  "data-hr-tooltip",
  "data-hr-crosshair",
  "data-hr-point",
  "data-hr-points",
  "data-hr-span"
]){
  assert(html.includes(attr),`missing ${attr}`);
}

assert(css.includes("height:240px"),"primary chart height missing");
assert(chart.includes("nearest(points,x)"),"nearest-point interaction missing");
assert(chart.includes("renderAxes"),"axes renderer missing");
assert(chart.includes("niceBounds"),"dynamic Y bounds missing");
assert(js.includes("ZZXHashrateChart.render"),"chart not wired");
assert(js.includes("ZZXHashrateModel.energy"),"energy model not wired");
assert(provider.includes("ZZXHashrateSource"),"shared source hook missing");
assert(provider.includes("mempool.space/api/v1/mining/hashrate"),"mempool fallback missing");
assert(!provider.toLowerCase().includes("allorigins"),"AllOrigins must not be used");

console.log("hashrate_chart_ui_selftest: PASS");

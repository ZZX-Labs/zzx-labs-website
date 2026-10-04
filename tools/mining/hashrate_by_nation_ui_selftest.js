const fs=require("fs");
const path=require("path");
function assert(ok,msg){if(!ok)throw new Error(msg)}

const root=path.resolve(__dirname,"../..");
const dir=path.join(root,"__partials/widgets/hashrate-by-nation");

const html=fs.readFileSync(path.join(dir,"widget.html"),"utf8");
const css=fs.readFileSync(path.join(dir,"widget.css"),"utf8");
const js=fs.readFileSync(path.join(dir,"widget.js"),"utf8");
const model=fs.readFileSync(path.join(dir,"js/model.js"),"utf8");
const provider=fs.readFileSync(path.join(dir,"js/provider.js"),"utf8");
const charts=fs.readFileSync(path.join(dir,"js/charts.js"),"utf8");

for(const attr of [
  "data-hbn-global",
  "data-hbn-confidence",
  "data-hbn-pool-coverage",
  "data-hbn-grid-coverage",
  "data-hbn-rank-svg",
  "data-hbn-time-svg",
  "data-hbn-tooltip",
  "data-hbn-search",
  "data-hbn-sort",
  "data-hbn-scroll",
  "data-hbn-body"
]){
  assert(html.includes(attr),`missing ${attr}`);
}

assert(model.includes("pool:0.60"),"pool weight missing");
assert(model.includes("grid:0.30"),"grid weight missing");
assert(model.includes("nodes:0.10"),"node weight missing");
assert(model.includes("miningPowerMW"),"mining power evidence missing");
assert(!model.includes("gridGenerationMW ??"),"generic grid generation must not feed mining estimator");
assert(provider.includes("/api/v1/mining/pools/24h"),"24h pool source missing");
assert(provider.includes("ZZXBitnodes"),"shared node source missing");
assert(!provider.toLowerCase().includes("allorigins"),"AllOrigins must not be used");
assert(charts.includes("renderRank"),"rank chart missing");
assert(charts.includes("renderTimeline"),"timeline chart missing");
assert(css.includes("--hbn-table-h:430px"),"scroll table height missing");
assert(css.includes("position:sticky"),"sticky table header missing");
assert(!html.toLowerCase().includes("pagination"),"pagination should not exist");
assert(!js.includes("state.page"),"page state should not exist");

console.log("hashrate_by_nation_ui_selftest: PASS");

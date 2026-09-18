const fs=require("fs");
const path=require("path");
function assert(ok,msg){if(!ok)throw new Error(msg)}

const root=path.resolve(__dirname,"../..");
const dir=path.join(root,"__partials/widgets/nodes-by-city");

const html=fs.readFileSync(path.join(dir,"widget.html"),"utf8");
const css=fs.readFileSync(path.join(dir,"widget.css"),"utf8");
const js=fs.readFileSync(path.join(dir,"widget.js"),"utf8");

for(const attr of [
  "data-nbc-sort",
  "data-nbc-scroll",
  "data-nbc-visible-count",
  "data-nbc-leaders",
  "data-nbc-coverage-label",
  "data-nbc-geo-joins",
  "data-nbc-geo-source",
  "data-nbc-nation-count"
]){
  assert(html.includes(attr),`missing ${attr}`);
}

for(const removed of [
  "data-nbc-page-size",
  "data-nbc-prev",
  "data-nbc-next",
  "data-nbc-page"
]){
  assert(!html.includes(removed),`pagination control still present: ${removed}`);
  assert(!js.includes(removed),`pagination logic still present: ${removed}`);
}

assert(!js.includes("PAGE_KEY"),"page-size persistence still present");
assert(!js.includes("state.page"),"page state still present");
assert(css.includes("max-height:var(--nbc-table-max-h)"),"bounded scroll viewport missing");
assert(css.includes("position:sticky"),"sticky table header missing");
assert(css.includes("nodes-by-city__nation"),"structured nation cell styling missing");
assert(js.includes("ZZXNodesByCityUI.renderRows"),"UI renderer not wired");
assert(js.includes("ZZXNodesByCityViewport.attach"),"viewport helper not wired");
assert(js.includes('case "city"'),"city sort missing");
assert(js.includes('case "region"'),"region sort missing");
assert(js.includes('case "nation"'),"nation sort missing");

console.log("nodes_by_city_scroll_ui_selftest: PASS");

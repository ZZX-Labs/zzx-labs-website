const fs=require("fs");
const path=require("path");
function assert(ok,msg){if(!ok)throw new Error(msg)}

const root=path.resolve(__dirname,"../..");
const dir=path.join(root,"__partials/widgets/nodes-by-county");

const html=fs.readFileSync(path.join(dir,"widget.html"),"utf8");
const css=fs.readFileSync(path.join(dir,"widget.css"),"utf8");
const js=fs.readFileSync(path.join(dir,"widget.js"),"utf8");

for(const attr of [
  "data-nbco-sort",
  "data-nbco-scroll",
  "data-nbco-visible-count",
  "data-nbco-leaders",
  "data-nbco-coverage-label",
  "data-nbco-geo-joins",
  "data-nbco-geo-source",
  "data-nbco-region-count",
  "data-nbco-nation-count"
]){
  assert(html.includes(attr),`missing ${attr}`);
}

for(const removed of [
  "data-nbco-page-size",
  "data-nbco-prev",
  "data-nbco-next",
  "data-nbco-page"
]){
  assert(!html.includes(removed),`pagination control still present: ${removed}`);
  assert(!js.includes(removed),`pagination logic still present: ${removed}`);
}

assert(!js.includes("PAGE_KEY"),"page-size persistence still present");
assert(!js.includes("state.page"),"page state still present");
assert(css.includes("max-height:var(--nbco-table-max-h)"),"bounded scroll viewport missing");
assert(css.includes("position:sticky"),"sticky table header missing");
assert(css.includes("nodes-by-county__admin-code"),"admin code badge styling missing");
assert(css.includes("nodes-by-county__nation"),"structured nation cell styling missing");
assert(js.includes("ZZXNodesByCountyUI.renderRows"),"UI renderer not wired");
assert(js.includes("ZZXNodesByCountyViewport.attach"),"viewport helper not wired");
assert(js.includes('case "county"'),"county sort missing");
assert(js.includes('case "region"'),"region sort missing");
assert(js.includes('case "nation"'),"nation sort missing");

console.log("nodes_by_county_scroll_ui_selftest: PASS");

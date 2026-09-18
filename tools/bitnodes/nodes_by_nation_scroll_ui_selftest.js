const fs=require("fs");
const path=require("path");
function assert(ok,msg){if(!ok)throw new Error(msg)}

const root=path.resolve(__dirname,"../..");
const dir=path.join(root,"__partials/widgets/nodes-by-nation");

const html=fs.readFileSync(path.join(dir,"widget.html"),"utf8");
const css=fs.readFileSync(path.join(dir,"widget.css"),"utf8");
const js=fs.readFileSync(path.join(dir,"widget.js"),"utf8");

for(const attr of [
  "data-nbn-sort",
  "data-nbn-scroll",
  "data-nbn-visible-count",
  "data-nbn-leaders",
  "data-nbn-coverage-label",
  "data-nbn-geo-joins",
  "data-nbn-geo-source"
]){
  assert(html.includes(attr),`missing ${attr}`);
}

for(const removed of [
  "data-nbn-page-size",
  "data-nbn-prev",
  "data-nbn-next",
  "data-nbn-page"
]){
  assert(!html.includes(removed),`pagination control still present: ${removed}`);
  assert(!js.includes(removed),`pagination logic still present: ${removed}`);
}

assert(!js.includes("slice(state.page"),"page slicing still present");
assert(!js.includes("PAGE_KEY"),"page-size persistence still present");
assert(css.includes("max-height:var(--nbn-table-max-h)"),"bounded scroll viewport missing");
assert(css.includes("position:sticky"),"sticky header missing");
assert(js.includes("ZZXNodesByNationUI.renderRows"),"UI module not wired");
assert(js.includes("ZZXNodesByNationViewport.attach"),"viewport module not wired");
assert(js.includes('case "nation"'),"nation sort missing");
assert(js.includes('case "iso"'),"ISO sort missing");

console.log("nodes_by_nation_scroll_ui_selftest: PASS");

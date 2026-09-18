const fs=require("fs");
const path=require("path");
function assert(ok,msg){if(!ok)throw new Error(msg)}

const root=path.resolve(__dirname,"../..");
const dir=path.join(root,"__partials/widgets/nodes-by-version");

const html=fs.readFileSync(path.join(dir,"widget.html"),"utf8");
const css=fs.readFileSync(path.join(dir,"widget.css"),"utf8");
const js=fs.readFileSync(path.join(dir,"widget.js"),"utf8");

for(const attr of [
  "data-nbv-search",
  "data-nbv-family",
  "data-nbv-geo",
  "data-nbv-scroll",
  "data-nbv-visible-count",
  "data-nbv-mix-core",
  "data-nbv-mix-knots",
  "data-nbv-mix-other"
]){
  assert(html.includes(attr),`missing ${attr}`);
}

for(const token of [
  "data-nbv-page-size",
  "data-nbv-prev",
  "data-nbv-next",
  "data-nbv-page",
  "PAGE_KEY",
  "state.page",
  "renderTable("
]){
  assert(!html.includes(token),`pagination HTML remains: ${token}`);
  assert(!js.includes(token),`pagination JS remains: ${token}`);
}

assert(!js.includes(".slice(start"),"paged row slicing remains");
assert(js.includes("renderReadout"),"continuous readout renderer missing");
assert(js.includes("ZZXNodesByVersionUI.renderRows(body,rows,0)"),"full filtered row set is not rendered");
assert(css.includes("--nbv-table-max-h:540px"),"desktop scroll height not upgraded");
assert(css.includes("position:sticky"),"sticky table header missing");
assert(js.includes('geo==="located"'),"located filter missing");
assert(js.includes('geo==="unlocated"'),"unlocated filter missing");
assert(js.includes('filter==="Other"'),"Other-family filter missing");

console.log("nodes_by_version_scroll_ui_selftest: PASS");

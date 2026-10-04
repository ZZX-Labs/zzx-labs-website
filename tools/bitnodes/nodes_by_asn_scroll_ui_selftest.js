const fs=require("fs");
const path=require("path");
function assert(ok,msg){if(!ok)throw new Error(msg)}

const root=path.resolve(__dirname,"../..");
const dir=path.join(root,"__partials/widgets/nodes-by-asn");
const html=fs.readFileSync(path.join(dir,"widget.html"),"utf8");
const css=fs.readFileSync(path.join(dir,"widget.css"),"utf8");
const js=fs.readFileSync(path.join(dir,"widget.js"),"utf8");

for(const attr of [
  "data-nbasn-geo",
  "data-nbasn-sort",
  "data-nbasn-scroll",
  "data-nbasn-visible-count",
  "data-nbasn-leaders",
  "data-nbasn-bar-known"
]){
  assert(html.includes(attr),`missing ${attr}`);
}

for(const token of [
  "data-nbasn-page-size",
  "data-nbasn-prev",
  "data-nbasn-next",
  "data-nbasn-page",
  "PAGE_KEY",
  "state.page"
]){
  assert(!html.includes(token),`pagination HTML remains: ${token}`);
  assert(!js.includes(token),`pagination JS remains: ${token}`);
}

assert(!js.includes("renderTable("),"old paged renderer remains");
assert(js.includes("renderReadout"),"continuous renderer missing");
assert(js.includes("ZZXNodesByAsnUI.renderRows(body,rows,0)"),"full set not rendered");
assert(css.includes("--nba-table-max-h:520px"),"desktop scroll height not upgraded");
assert(css.includes("position:sticky"),"sticky header missing");
assert(js.includes('geo==="located"'),"geography filter missing");
assert(js.includes('case "organization"'),"organization sort missing");

console.log("nodes_by_asn_scroll_ui_selftest: PASS");

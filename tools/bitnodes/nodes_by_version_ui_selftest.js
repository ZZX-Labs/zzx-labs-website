const fs=require("fs");
const path=require("path");

function assert(ok,msg){if(!ok)throw new Error(msg);}
const root=path.resolve(__dirname,"../..");
const dir=path.join(root,"__partials/widgets/nodes-by-version");

const html=fs.readFileSync(path.join(dir,"widget.html"),"utf8");
const css=fs.readFileSync(path.join(dir,"widget.css"),"utf8");
const js=fs.readFileSync(path.join(dir,"widget.js"),"utf8");

for(const attr of [
  "data-nbv-family",
  "data-nbv-geo",
  "data-nbv-scroll",
  "data-nbv-visible-count",
  "data-nbv-mix-core",
  "data-nbv-location-summary"
]){
  assert(html.includes(attr),`missing HTML contract ${attr}`);
}

assert(css.includes("max-height:var(--nbv-table-max-h)"),"bounded table height missing");
assert(css.includes("position:sticky"),"sticky header missing");
assert(css.includes("white-space:nowrap"),"nowrap protection missing");
assert(css.includes("nodes-by-version__family"),"family badge styling missing");
assert(css.includes("nodes-by-version__nation"),"structured nation styling missing");
assert(js.includes("ZZXNodesByVersionUI.renderRows"),"UI module not used");
assert(js.includes("ZZXNodesByVersionViewport.attach"),"viewport module not used");
assert(js.includes("Bitcoin Knots"),"family filtering missing");
assert(js.includes('geo==="located"'),"geography filtering missing");

console.log("nodes_by_version_ui_selftest: PASS");

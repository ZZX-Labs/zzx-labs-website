const fs=require("fs");
const path=require("path");
function assert(ok,msg){if(!ok)throw new Error(msg)}

const root=path.resolve(__dirname,"../..");
const dir=path.join(root,"__partials/widgets/knots-vs-core");

const html=fs.readFileSync(path.join(dir,"widget.html"),"utf8");
const css=fs.readFileSync(path.join(dir,"widget.css"),"utf8");
const js=fs.readFileSync(path.join(dir,"widget.js"),"utf8");

for(const attr of [
  "data-kvc-nation-search",
  "data-kvc-nation-sort",
  "data-kvc-nation-scroll",
  "data-kvc-version-visible",
  "data-kvc-search",
  "data-kvc-client",
  "data-kvc-geo",
  "data-kvc-sort",
  "data-kvc-version-scroll"
]){
  assert(html.includes(attr),`missing ${attr}`);
}

for(const token of [
  "page-size",
  "data-kvc-prev",
  "data-kvc-next",
  "data-kvc-page",
  "PAGE_KEY",
  "state.page"
]){
  assert(!html.includes(token),`pagination HTML remains: ${token}`);
  assert(!js.includes(token),`pagination JS remains: ${token}`);
}

assert(!js.includes(".slice("),"paged row slicing remains");
assert(css.includes("--kvc-nation-max-h:360px"),"nation scroll height missing");
assert(css.includes("--kvc-version-max-h:520px"),"version scroll height missing");
assert(css.includes("position:sticky"),"sticky headers missing");
assert(js.includes("filteredNationRows"),"nation full-set filtering missing");
assert(js.includes("filteredVersionRows"),"version full-set filtering missing");
assert(js.includes('geo==="located"'),"located version filter missing");
assert(js.includes('geo==="unlocated"'),"unlocated version filter missing");
assert(js.includes('case "knots-desc"'),"nation Knots sort missing");
assert(js.includes('sort==="client-version"'),"version client/version sort missing");

console.log("knots_vs_core_scroll_ui_selftest: PASS");

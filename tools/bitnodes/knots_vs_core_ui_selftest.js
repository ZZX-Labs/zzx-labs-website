const fs=require("fs");
const path=require("path");
const vm=require("vm");

function assert(ok,msg){if(!ok)throw new Error(msg);}
const root=path.resolve(__dirname,"../..");
const widget=path.join(root,"__partials/widgets/knots-vs-core");

const html=fs.readFileSync(path.join(widget,"widget.html"),"utf8");
const css=fs.readFileSync(path.join(widget,"widget.css"),"utf8");
const js=fs.readFileSync(path.join(widget,"widget.js"),"utf8");

assert(html.includes("data-kvc-nation-scroll"),"nation scroll contract missing");
assert(html.includes("data-kvc-version-scroll"),"version scroll contract missing");
assert(css.includes("max-height:var(--kvc-nation-max-h)"),"nation max-height missing");
assert(css.includes("max-height:var(--kvc-version-max-h)"),"version max-height missing");
assert(css.includes("position:sticky"),"sticky table headers missing");
assert(css.includes("grid-template-columns:minmax(315px,max-content)"),"desktop non-collapsing versions header missing");
assert(css.includes("white-space:nowrap"),"nowrap protection missing");
assert(!js.includes(".slice(0,100)"),"hard 100-row version cap still present");
assert(js.includes("ZZXKnotsCoreUI.renderVersionRows"),"UI module not used");
assert(js.includes("ZZXKnotsCoreViewport.attach"),"viewport module not used");
console.log("knots_vs_core_ui_selftest: PASS");

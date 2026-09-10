const fs=require("fs"),path=require("path");
function assert(x,m){if(!x)throw new Error(m)}
const d=path.resolve(__dirname,"../..","__partials/widgets/global-power-grid");
const html=fs.readFileSync(path.join(d,"widget.html"),"utf8");
const css=fs.readFileSync(path.join(d,"widget.css"),"utf8");
const js=fs.readFileSync(path.join(d,"widget.js"),"utf8");
for(const t of ["data-gpg-profile-chart","data-gpg-timezone-chart","data-gpg-period","data-gpg-body","data-gpg-search","data-gpg-sort","data-gpg-scroll"])assert(html.includes(t),`missing ${t}`);
assert(css.includes("position:sticky"),"sticky table");
assert(js.includes("ZZXGlobalPowerGridLatest"),"shared export missing");
assert(!js.includes("state.page"),"pagination state prohibited");
console.log("global_power_grid_ui_selftest: PASS");

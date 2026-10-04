const fs=require("fs"),path=require("path");
const root=path.resolve(__dirname,"..");
const p=fs.readFileSync(path.join(root,"__partials/widgets/global-power-grid/js/provider.js"),"utf8");
const a=fs.readFileSync(path.join(root,"__partials/worldfactbook/archive.js"),"utf8");
function assert(x,m){if(!x)throw new Error(m)}
assert(p.includes("ZZXWorldFactbookArchive"),"provider archive integration missing");
assert(p.includes("/worldfactbook/api/electricity-history.json"),"canonical ledger missing");
assert(a.includes("archive.org/advancedsearch.php"),"Internet Archive discovery missing");
assert(a.includes("indexedDB"),"IndexedDB cache missing");
assert(a.includes("expandHistory"),"historical expansion missing");
assert(!a.toLowerCase().includes("allorigins"),"AllOrigins prohibited");
console.log("worldfactbook_browser_archive_selftest: PASS");

const fs=require("fs");
const path=require("path");
function assert(ok,msg){if(!ok)throw new Error(msg)}

const root=path.resolve(__dirname,"../..");
const dir=path.join(root,"__partials/widgets/nodes");
const html=fs.readFileSync(path.join(dir,"widget.html"),"utf8");
const css=fs.readFileSync(path.join(dir,"widget.css"),"utf8");
const js=fs.readFileSync(path.join(dir,"widget.js"),"utf8");

for(const attr of [
  "data-nodes-ip-count",
  "data-nodes-ip-search",
  "data-nodes-ip-version",
  "data-nodes-ip-copy",
  "data-nodes-ipv4-count",
  "data-nodes-ipv6-count",
  "data-nodes-ip-overlay",
  "data-nodes-ip-scroll",
  "data-nodes-ip-body"
]){
  assert(html.includes(attr),`missing ${attr}`);
}

assert(css.includes("nodes__ip-table-wrap"),"IP table styling missing");
assert(css.includes("position:sticky"),"sticky header missing");
assert(js.includes("ZZXNodeIPAddresses.build"),"IP module not used");
assert(js.includes("copyVisibleIPs"),"copy action missing");
assert(js.includes("renderIPRows"),"IP rendering missing");

console.log("nodes_ip_ui_selftest: PASS");

const fs=require("fs");
const path=require("path");

function assert(ok,msg){if(!ok)throw new Error(msg);}
const root=path.resolve(__dirname,"../..");
const dir=path.join(root,"__partials/widgets/nodes-by-asn");

const html=fs.readFileSync(path.join(dir,"widget.html"),"utf8");
const css=fs.readFileSync(path.join(dir,"widget.css"),"utf8");
const js=fs.readFileSync(path.join(dir,"widget.js"),"utf8");
const manifest=JSON.parse(fs.readFileSync(path.join(root,"__partials/widgets/manifest.json"),"utf8"));
const ticker=fs.readFileSync(path.join(root,"__partials/bitcoin-ticker-widget.html"),"utf8");

for(const attr of [
  "data-nbasn-geo",
  "data-nbasn-sort",
  "data-nbasn-scroll",
  "data-nbasn-leaders",
  "data-nbasn-bar-known",
  "data-nbasn-visible-count",
  "data-nbasn-network-total"
]){
  assert(html.includes(attr),`missing HTML contract ${attr}`);
}

assert(css.includes("max-height:var(--nba-table-max-h)"),"bounded ASN table missing");
assert(css.includes("position:sticky"),"sticky ASN header missing");
assert(css.includes("nodes-by-asn__leader"),"leader presentation missing");
assert(css.includes("nodes-by-asn__nation"),"structured nation styling missing");
assert(js.includes("ZZXNodesByAsnUI.renderRows"),"UI module not used");
assert(js.includes("ZZXNodesByAsnViewport.attach"),"viewport module not used");
assert(js.includes('case "organization"'),"sort modes missing");
assert(js.includes('geo==="located"'),"geo filtering missing");

const asn=manifest.widgets.filter(w=>w.id==="nodes-by-asn");
assert(asn.length===1,"manifest must contain exactly one nodes-by-asn entry");
assert(asn[0].enabled===true,"nodes-by-asn must be enabled");
assert(asn[0].priority===42.75,"nodes-by-asn priority must be 42.75");

const slots=[...ticker.matchAll(/data-widget="nodes-by-asn"/g)];
assert(slots.length===1,"ticker must contain exactly one nodes-by-asn slot");
assert(ticker.includes("priority 42.75: Nodes by ASN"),"ticker ASN priority comment missing");
assert(ticker.indexOf('data-widget="nodes-by-county"') < ticker.indexOf('data-widget="nodes-by-asn"'),"ASN must follow County");
assert(ticker.indexOf('data-widget="nodes-by-asn"') < ticker.indexOf('data-widget="nodes-by-version"'),"ASN must precede Version");

console.log("nodes_by_asn_ui_integration_selftest: PASS");

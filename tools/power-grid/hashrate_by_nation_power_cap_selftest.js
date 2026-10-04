const fs=require("fs"),p=require("path");
const f=p.resolve(__dirname,"../..","__partials/widgets/hashrate-by-nation/js/model.js");
const s=fs.readFileSync(f,"utf8");
if(!s.includes("applyPhysicalCeilings"))throw new Error("physical cap helper missing");
if(!s.includes("absoluteMiningCeilingEH"))throw new Error("ceiling field missing");
console.log("hashrate_by_nation_power_cap_selftest: PASS");

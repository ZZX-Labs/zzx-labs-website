(()=>{"use strict";const $=id=>document.getElementById(id),state={artifacts:{},last:null};
function dl(text,name,type="text/plain"){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),900)}
async function runRecipe(override=null){try{const steps=override||ChefCore.parseRecipe($("recipe").value);state.last=await ChefCore.recipe($("input").value,steps);$("output").value=state.last.output;$("trace").textContent=JSON.stringify({stats:ChefCore.stats($("input").value),trace:state.last.trace},null,2);return state.last}catch(e){$("trace").textContent=`ERROR: ${e.message}`;throw e}}
$("run").onclick=()=>runRecipe();document.querySelectorAll(".quick").forEach(b=>b.onclick=()=>{const r=[{op:b.dataset.op}];$("recipe").value=JSON.stringify(r,null,2);runRecipe(r)});$("swap").onclick=()=>{const t=$("input").value;$("input").value=$("output").value;$("output").value=t};$("clear").onclick=()=>{$("input").value="";$("output").value="";$("trace").textContent=""};

function genLua(){const m=$("module").value.trim()||"cyberchef",cli=$("cli").value.trim()||"cybercheflua";const lib=`local M = {}

local b='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function M.to_hex(s) return (s:gsub('.', function(c) return string.format('%02x', string.byte(c)) end)) end
function M.from_hex(h) return (h:gsub('..', function(cc) return string.char(tonumber(cc,16)) end)) end
function M.to_base64(data)
  return ((data:gsub('.', function(x)
    local r,bits='',x:byte()
    for i=8,1,-1 do r=r..(bits%2^i-bits%2^(i-1)>0 and '1' or '0') end
    return r
  end)..'0000'):gsub('%d%d%d?%d?%d?%d?', function(x)
    if #x < 6 then return '' end
    local c=0
    for i=1,6 do c=c+(x:sub(i,i)=='1' and 2^(6-i) or 0) end
    return b:sub(c+1,c+1)
  end)..({'','==','='})[#data%3+1])
end
return M
`;const bin=`#!/usr/bin/env lua
local chef=require("${m}")
local op,arg=arg[1],arg[2] or ""
if op=="hex" then print(chef.to_hex(arg))
elseif op=="base64" then print(chef.to_base64(arg))
else io.stderr:write("usage: ${cli} <hex|base64> <input>\\n"); os.exit(2) end
`;state.artifacts["lua/"+m+".lua"]=lib;state.artifacts["bin/"+cli]=bin;$("lua-output").textContent=`--- ${m}.lua ---\n${lib}\n--- ${cli} ---\n${bin}`;return lib}
$("gen-lua").onclick=genLua;
$("gen-openresty").onclick=()=>{const route=$("route").value.trim()||"/transform",max=Math.max(1024,+$("max-body").value||1048576),m=$("module").value.trim()||"cyberchef";const h=`location = ${route} {
    client_max_body_size ${max};
    content_by_lua_block {
        ngx.req.read_body()
        local cjson = require "cjson.safe"
        local chef = require "${m}"
        local q = cjson.decode(ngx.req.get_body_data() or "") or {}
        local ops = { hex = chef.to_hex, base64 = chef.to_base64 }
        if ngx.req.get_method() ~= "POST" or not ops[q.op] then ngx.status=400; ngx.say('{"error":"invalid request"}'); return end
        ngx.header.content_type="application/json"
        ngx.say(cjson.encode({output=ops[q.op](tostring(q.input or ""))}))
    }
}
`;state.artifacts["openresty/location.conf"]=h;$("openresty-output").textContent=h};
$("gen-rock").onclick=async()=>{const m=$("module").value.trim()||"cyberchef";const rock=`package = "${m}"
version = "0.1.0-1"
source = { url = "git+https://github.com/ZZX-Labs/cybercheflua.git" }
description = { summary = "CyberChef-style Lua transforms", license = "Apache-2.0" }
build = { type = "builtin", modules = { ["${m}"] = "lua/${m}.lua" } }
`;const v=[];for(const [op,input,expected] of [["toBase64","abc","YWJj"],["toHex","abc","616263"]]){const actual=await ChefCore.op(op,input);v.push({op,input,expected,actual,pass:actual===expected})}state.artifacts[m+"-0.1.0-1.rockspec"]=rock;state.artifacts["vectors.json"]=JSON.stringify(v,null,2);$("package-output").textContent=`${rock}\n${JSON.stringify(v,null,2)}`};
$("export").onclick=()=>{const t=JSON.stringify({schema:"zzx.cybercheflua.bundle.v1",artifacts:state.artifacts},null,2);dl(t,"cybercheflua-bundle.json","application/json");$("export-output").textContent=t};genLua();

runRecipe();window.CyberChefLua=Object.freeze({version:"0.1.0-alpha-web",runRecipe:ChefCore.recipe,getArtifacts:()=>JSON.parse(JSON.stringify(state.artifacts))});window.ZZXHooks?.emit("cybercheflua:ready",{version:"0.1.0-alpha-web"});})();

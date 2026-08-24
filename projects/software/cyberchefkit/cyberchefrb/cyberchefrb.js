(()=>{"use strict";const $=id=>document.getElementById(id),state={artifacts:{},last:null};
function dl(text,name,type="text/plain"){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),900)}
async function runRecipe(override=null){try{const steps=override||ChefCore.parseRecipe($("recipe").value);state.last=await ChefCore.recipe($("input").value,steps);$("output").value=state.last.output;$("trace").textContent=JSON.stringify({stats:ChefCore.stats($("input").value),trace:state.last.trace},null,2);return state.last}catch(e){$("trace").textContent=`ERROR: ${e.message}`;throw e}}
$("run").onclick=()=>runRecipe();document.querySelectorAll(".quick").forEach(b=>b.onclick=()=>{const r=[{op:b.dataset.op}];$("recipe").value=JSON.stringify(r,null,2);runRecipe(r)});$("swap").onclick=()=>{const t=$("input").value;$("input").value=$("output").value;$("output").value=t};$("clear").onclick=()=>{$("input").value="";$("output").value="";$("trace").textContent=""};

function lib(){const mod=$("module").value.trim()||"ZZXLabs::CyberChef";const parts=mod.split("::"),inner=parts.pop(),outer=parts.join("::")||"ZZXLabs";const x=`require "base64"
require "digest"
require "uri"

module ${outer}
  module ${inner}
    module_function

    def to_hex(input) = input.to_s.encode("UTF-8").unpack1("H*")
    def from_hex(input) = [input.to_s].pack("H*")
    def to_base64(input) = Base64.strict_encode64(input.to_s)
    def from_base64(input) = Base64.strict_decode64(input.to_s)
    def sha256(input) = Digest::SHA256.hexdigest(input.to_s)
    def url_encode(input) = URI.encode_www_form_component(input.to_s)
    def url_decode(input) = URI.decode_www_form_component(input.to_s)
  end
end
`;state.artifacts["lib/cyberchef.rb"]=x;$("ruby-output").textContent=x;return x}
$("gen-ruby").onclick=lib;
$("gen-gem").onclick=()=>{const gem=$("gem").value.trim()||"cyberchefrb",mod=$("module").value.trim()||"ZZXLabs::CyberChef";const spec=`Gem::Specification.new do |s|
  s.name = "${gem}"
  s.version = "0.1.0.alpha"
  s.summary = "CyberChef-style Ruby transforms"
  s.license = "Apache-2.0"
  s.files = Dir["lib/**/*.rb", "bin/*"]
  s.executables = ["${gem}"]
  s.required_ruby_version = ">= 3.1"
end
`;const cli=`#!/usr/bin/env ruby
require_relative "../lib/cyberchef"
op, input = ARGV[0], ARGV[1].to_s
fn = { "hex" => :to_hex, "base64" => :to_base64, "sha256" => :sha256 }[op]
abort("usage: ${gem} <hex|base64|sha256> <input>") unless fn
puts ${mod}.public_send(fn, input)
`;state.artifacts[gem+".gemspec"]=spec;state.artifacts["bin/"+gem]=cli;lib();$("gem-output").textContent=`${spec}\n${cli}`};
$("gen-rails").onclick=()=>{const mod=$("module").value.trim()||"ZZXLabs::CyberChef";const x=`class CyberChefService
  OPS = {
    "hex" => :to_hex,
    "base64" => :to_base64,
    "sha256" => :sha256
  }.freeze

  def self.call(op:, input:)
    fn = OPS.fetch(op)
    ${mod}.public_send(fn, input.to_s)
  end
end
`;state.artifacts["app/services/cyber_chef_service.rb"]=x;$("rails-output").textContent=x};
$("export").onclick=()=>{lib();const t=JSON.stringify({schema:"zzx.cyberchefrb.bundle.v1",artifacts:state.artifacts},null,2);dl(t,"cyberchefrb-bundle.json","application/json");$("export-output").textContent=t};lib();

runRecipe();window.CyberChefRuby=Object.freeze({version:"0.1.0-alpha-web",runRecipe:ChefCore.recipe,getArtifacts:()=>JSON.parse(JSON.stringify(state.artifacts))});window.ZZXHooks?.emit("cyberchefrb:ready",{version:"0.1.0-alpha-web"});})();

(()=>{"use strict";
const $=id=>document.getElementById(id);
const state={last:null,artifacts:{}};
function dl(text,name,type="text/plain"){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)}
async function runRecipe(override=null){try{const steps=override||ChefCore.parseRecipe($("recipe").value);state.last=await ChefCore.recipe($("input").value,steps);$("output").value=state.last.output;$("trace").textContent=JSON.stringify({stats:ChefCore.stats($("input").value),trace:state.last.trace},null,2);return state.last}catch(e){$("trace").textContent=`ERROR: ${e.message}`;throw e}}
$("run").onclick=()=>runRecipe();
document.querySelectorAll(".quick").forEach(b=>b.onclick=()=>{const r=[{op:b.dataset.op}];$("recipe").value=JSON.stringify(r,null,2);runRecipe(r)});
$("swap").onclick=()=>{const x=$("input").value;$("input").value=$("output").value;$("output").value=x};
$("clear").onclick=()=>{$("input").value="";$("output").value="";$("trace").textContent=""};

function modulePath(m){return "lib/"+m.replaceAll("::","/")+".pm"}
function genModule(){
 const m=$("module").value.trim()||"ZZXLabs::CyberChef",p=$("prefix").value.trim()||"cc";
 const code=`package ${m};

use strict;
use warnings;
use utf8;
use Exporter 'import';
use Digest::SHA qw(sha256_hex);
use MIME::Base64 qw(encode_base64 decode_base64);
use URI::Escape qw(uri_escape_utf8 uri_unescape);

our @EXPORT_OK = qw(${p}_to_hex ${p}_from_hex ${p}_to_base64 ${p}_from_base64 ${p}_sha256 ${p}_url_encode ${p}_url_decode);

sub ${p}_to_hex {
    my ($s) = @_;
    return unpack('H*', $s);
}

sub ${p}_from_hex {
    my ($h) = @_;
    die "invalid hex" if length($h) % 2 || $h =~ /[^0-9a-f]/i;
    return pack('H*', $h);
}

sub ${p}_to_base64 {
    my ($s) = @_;
    return encode_base64($s, '');
}

sub ${p}_from_base64 {
    my ($s) = @_;
    return decode_base64($s);
}

sub ${p}_sha256 {
    my ($s) = @_;
    return sha256_hex($s);
}

sub ${p}_url_encode { return uri_escape_utf8($_[0]); }
sub ${p}_url_decode { return uri_unescape($_[0]); }

1;
`;
 state.artifacts[modulePath(m)]=code;$("module-output").textContent=code;return code
}
$("gen-module").onclick=genModule;

$("gen-cli").onclick=()=>{
 const m=$("module").value.trim()||"ZZXLabs::CyberChef",p=$("prefix").value.trim()||"cc",cmd=$("command").value.trim()||"cyberchefperl",def=$("default-op").value;
 const cli=`#!/usr/bin/env perl
use strict;
use warnings;
use FindBin;
use lib "$FindBin::Bin/../lib";
use ${m} qw(${p}_to_hex ${p}_to_base64 ${p}_sha256);

my $op = shift(@ARGV) // '${def}';
my $input = @ARGV ? join(' ', @ARGV) : do { local $/; <STDIN> };

my %ops = (
    hex => \\&${p}_to_hex,
    base64 => \\&${p}_to_base64,
    sha256 => \\&${p}_sha256,
);

die "unknown operation\\n" unless exists $ops{$op};
print $ops{$op}->($input), "\\n";
`;
 const examples=`printf '%s' 'abc' | ${cmd} sha256
${cmd} hex 'abc'
${cmd} base64 'abc'
`;
 state.artifacts["bin/"+cmd]=cli;state.artifacts["examples/unix.txt"]=examples;genModule();$("cli-output").textContent=`--- bin/${cmd} ---\n${cli}\n--- examples ---\n${examples}`
};

$("gen-package").onclick=()=>{
 const m=$("module").value.trim()||"ZZXLabs::CyberChef",dist=$("dist").value.trim()||"ZZXLabs-CyberChef",ver=$("version").value.trim()||"0.001";
 const makefile=`use strict;
use warnings;
use ExtUtils::MakeMaker;

WriteMakefile(
    NAME => '${m}',
    VERSION => '${ver}',
    ABSTRACT => 'CyberChef-style transform primitives',
    LICENSE => 'apache_2_0',
    PREREQ_PM => {
        'Digest::SHA' => 0,
        'MIME::Base64' => 0,
        'URI::Escape' => 0,
    },
    EXE_FILES => ['bin/${$("command").value.trim()||"cyberchefperl"}'],
);
`;
 state.artifacts["Makefile.PL"]=makefile;state.artifacts["DISTNAME"]=dist;$("package-output").textContent=makefile
};

$("vectors").onclick=async()=>{
 const vec=[["toBase64","abc","YWJj"],["toHex","abc","616263"],["sha256","abc","ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"]],out=[];
 for(const [op,input,expected] of vec){const actual=await ChefCore.op(op,input);out.push({op,input,expected,actual,pass:actual===expected})}
 const m=$("module").value.trim()||"ZZXLabs::CyberChef",p=$("prefix").value.trim()||"cc";
 const test=`use strict;
use warnings;
use Test::More tests => 3;
use ${m} qw(${p}_to_hex ${p}_to_base64 ${p}_sha256);

is(${p}_to_base64('abc'), 'YWJj', 'base64 vector');
is(${p}_to_hex('abc'), '616263', 'hex vector');
is(${p}_sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'sha256 vector');
`;
 state.artifacts["t/vectors.t"]=test;state.artifacts["vectors.json"]=JSON.stringify(out,null,2);$("vectors-output").textContent=JSON.stringify({results:out,testMore:"generated"},null,2)
};

$("export").onclick=()=>{const t=JSON.stringify({schema:"zzx.cyberchefperl.bundle.v1",version:"0.1.0-alpha",artifacts:state.artifacts},null,2);dl(t,"cyberchefperl-bundle.json","application/json");$("export-output").textContent=t};
genModule();

runRecipe();
window.CyberChefPerl=Object.freeze({version:"0.1.0-alpha-web",runRecipe:ChefCore.recipe,getArtifacts:()=>JSON.parse(JSON.stringify(state.artifacts))});
window.ZZXHooks?.emit("cyberchefperl:ready",{version:"0.1.0-alpha-web"});
})();

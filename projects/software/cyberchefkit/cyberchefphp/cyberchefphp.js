(()=>{"use strict";
const $=id=>document.getElementById(id),state={last:null,artifacts:{}};
function dl(text,name,type="text/plain"){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
async function runRecipe(override=null){try{const steps=override||ChefCore.parseRecipe($("recipe").value);state.last=await ChefCore.recipe($("input").value,steps);$("output").value=state.last.output;$("trace").textContent=JSON.stringify({stats:ChefCore.stats($("input").value),trace:state.last.trace},null,2);return state.last}catch(e){$("trace").textContent=`ERROR: ${e.message}`;throw e}}
if($("run"))$("run").onclick=()=>runRecipe();
document.querySelectorAll(".quick").forEach(b=>b.onclick=()=>{const r=[{op:b.dataset.op}];$("recipe").value=JSON.stringify(r,null,2);runRecipe(r)});
if($("swap"))$("swap").onclick=()=>{const x=$("input").value;$("input").value=$("output").value;$("output").value=x};
if($("clear"))$("clear").onclick=()=>{$("input").value="";$("output").value="";$("trace").textContent=""};

function nsRaw(){return $("namespace").value.trim().replaceAll("\\\\","\\")||"ZZXLabs\\CyberChef"}
function phpLibrary(){
 const ns=nsRaw(),cl=$("class-name").value.trim()||"CyberChef";
 const code=`<?php
declare(strict_types=1);

namespace ${ns};

final class ${cl}
{
    public static function toHex(string $input): string
    {
        return bin2hex($input);
    }

    public static function fromHex(string $input): string
    {
        $out = hex2bin($input);
        if ($out === false) throw new \\InvalidArgumentException('invalid hex');
        return $out;
    }

    public static function toBase64(string $input): string
    {
        return base64_encode($input);
    }

    public static function fromBase64(string $input): string
    {
        $out = base64_decode($input, true);
        if ($out === false) throw new \\InvalidArgumentException('invalid base64');
        return $out;
    }

    public static function sha256(string $input): string
    {
        return hash('sha256', $input);
    }

    public static function urlEncode(string $input): string
    {
        return rawurlencode($input);
    }

    public static function urlDecode(string $input): string
    {
        return rawurldecode($input);
    }
}
`;
 state.artifacts["src/CyberChef.php"]=code;$("php-output").textContent=code;return code
}
$("gen-php").onclick=phpLibrary;
$("gen-cli").onclick=()=>{
 const ns=nsRaw(),cl=$("class-name").value.trim()||"CyberChef",pkg=$("composer-name").value.trim()||"zzx-labs/cyberchefphp",cmd=$("cli-name").value.trim()||"cyberchefphp",php=$("php-version").value;
 const composer={name:pkg,description:"CyberChef-style transforms for PHP",license:"Apache-2.0",require:{php:`>=${php}`},autoload:{"psr-4":{[ns+"\\\\"]:"src/"}},bin:["bin/"+cmd],"require-dev":{"phpunit/phpunit":"^11.0"}};
 const cli=`#!/usr/bin/env php
<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use ${ns}\\${cl};

[$script, $op, $input] = array_pad($argv, 3, '');
if ($op === '' || $input === '') {
    fwrite(STDERR, "usage: ${cmd} <hex|base64|sha256> <input>\\n");
    exit(2);
}

$out = match ($op) {
    'hex' => ${cl}::toHex($input),
    'base64' => ${cl}::toBase64($input),
    'sha256' => ${cl}::sha256($input),
    default => throw new InvalidArgumentException('unknown operation'),
};

fwrite(STDOUT, $out . PHP_EOL);
`;
 state.artifacts["composer.json"]=JSON.stringify(composer,null,2);state.artifacts["bin/"+cmd]=cli;phpLibrary();$("cli-output").textContent=`--- composer.json ---\n${JSON.stringify(composer,null,2)}\n--- bin/${cmd} ---\n${cli}`
};
$("gen-server").onclick=()=>{
 const ns=nsRaw(),cl=$("class-name").value.trim()||"CyberChef",max=Math.max(1024,+$("max-bytes").value||1048576);
 const endpoint=`<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use ${ns}\\${cl};

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'POST required']);
    exit;
}

$length = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($length > ${max}) {
    http_response_code(413);
    echo json_encode(['error' => 'request too large']);
    exit;
}

$raw = file_get_contents('php://input', false, null, 0, ${max} + 1);
$data = json_decode($raw ?: '', true);
if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['error' => 'invalid JSON']);
    exit;
}

$op = (string)($data['op'] ?? '');
$input = (string)($data['input'] ?? '');

try {
    $output = match ($op) {
        'hex' => ${cl}::toHex($input),
        'base64' => ${cl}::toBase64($input),
        'sha256' => ${cl}::sha256($input),
        default => throw new InvalidArgumentException('unknown operation'),
    };
    echo json_encode(['output' => $output], JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(400);
    echo json_encode(['error' => $e->getMessage()]);
}
`;
 state.artifacts["public/index.php"]=endpoint;$("server-output").textContent=endpoint
};
$("vectors").onclick=async()=>{
 const vec=[["toBase64","abc","YWJj"],["toHex","abc","616263"],["sha256","abc","ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"]],out=[];
 for(const [op,input,expected] of vec){const actual=await ChefCore.op(op,input);out.push({op,input,expected,actual,pass:actual===expected})}
 const ns=nsRaw(),cl=$("class-name").value.trim()||"CyberChef";
 const test=`<?php
declare(strict_types=1);

use PHPUnit\\Framework\\TestCase;
use ${ns}\\${cl};

final class CyberChefTest extends TestCase
{
    public function testVectors(): void
    {
        self::assertSame('YWJj', ${cl}::toBase64('abc'));
        self::assertSame('616263', ${cl}::toHex('abc'));
        self::assertSame('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', ${cl}::sha256('abc'));
    }
}
`;
 state.artifacts["tests/CyberChefTest.php"]=test;state.artifacts["vectors.json"]=JSON.stringify(out,null,2);$("vectors-output").textContent=JSON.stringify({results:out,phpunit:"generated"},null,2)
};
$("export").onclick=()=>{const t=JSON.stringify({schema:"zzx.cyberchefphp.bundle.v1",version:"0.1.0-alpha",artifacts:state.artifacts},null,2);dl(t,"cyberchefphp-bundle.json","application/json");$("export-output").textContent=t};
phpLibrary();

if($("run"))runRecipe();
window.CyberChefPHP=Object.freeze({version:"0.1.0-alpha-web",runRecipe:ChefCore.recipe,getArtifacts:()=>JSON.parse(JSON.stringify(state.artifacts))});
window.ZZXHooks?.emit("cyberchefphp:ready",{version:"0.1.0-alpha-web"});
})();

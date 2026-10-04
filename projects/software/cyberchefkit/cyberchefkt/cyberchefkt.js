(()=>{"use strict";
const $=id=>document.getElementById(id);
const state={last:null,artifacts:{}};
function dl(text,name,type="text/plain"){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)}
async function runRecipe(override=null){try{const steps=override||ChefCore.parseRecipe($("recipe").value);state.last=await ChefCore.recipe($("input").value,steps);$("output").value=state.last.output;$("trace").textContent=JSON.stringify({stats:ChefCore.stats($("input").value),trace:state.last.trace},null,2);return state.last}catch(e){$("trace").textContent=`ERROR: ${e.message}`;throw e}}
$("run").onclick=()=>runRecipe();
document.querySelectorAll(".quick").forEach(b=>b.onclick=()=>{const r=[{op:b.dataset.op}];$("recipe").value=JSON.stringify(r,null,2);runRecipe(r)});
$("swap").onclick=()=>{const x=$("input").value;$("input").value=$("output").value;$("output").value=x};
$("clear").onclick=()=>{$("input").value="";$("output").value="";$("trace").textContent=""};

function genKotlin(){
 const pkg=$("package").value.trim()||"io.zzxlabs.cyberchef",obj=$("object").value.trim()||"CyberChef";
 const code=`package ${pkg}

import java.net.URLEncoder
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.Base64
import java.util.HexFormat

object ${obj} {
    fun toHex(input: String): String =
        HexFormat.of().formatHex(input.toByteArray(StandardCharsets.UTF_8))

    fun fromHex(input: String): String =
        String(HexFormat.of().parseHex(input), StandardCharsets.UTF_8)

    fun toBase64(input: String): String =
        Base64.getEncoder().encodeToString(input.toByteArray(StandardCharsets.UTF_8))

    fun fromBase64(input: String): String =
        String(Base64.getDecoder().decode(input), StandardCharsets.UTF_8)

    fun sha256(input: String): String =
        HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(input.toByteArray(StandardCharsets.UTF_8)))

    fun urlEncode(input: String): String = URLEncoder.encode(input, StandardCharsets.UTF_8)
    fun urlDecode(input: String): String = URLDecoder.decode(input, StandardCharsets.UTF_8)
}
`;
 state.artifacts["src/main/kotlin/"+pkg.replaceAll(".","/")+"/"+obj+".kt"]=code;$("kotlin-output").textContent=code;return code
}
$("gen-kotlin").onclick=genKotlin;
$("gen-gradle").onclick=()=>{
 const project=$("project").value.trim()||"cyberchefkt",kv=$("kotlin-version").value.trim()||"2.0.20",jvm=$("jvm").value,pkg=$("package").value.trim()||"io.zzxlabs.cyberchef",obj=$("object").value.trim()||"CyberChef";
 const settings=`rootProject.name = "${project}"\n`;
 const build=`plugins {
    kotlin("jvm") version "${kv}"
    application
}

repositories { mavenCentral() }

kotlin { jvmToolchain(${jvm}) }

application { mainClass.set("${pkg}.MainKt") }

dependencies { testImplementation(kotlin("test")) }

tasks.test { useJUnitPlatform() }
`;
 const cli=`package ${pkg}

fun main(args: Array<String>) {
    require(args.size >= 2) { "usage: cyberchefkt <hex|base64|sha256> <input>" }
    val out = when (args[0]) {
        "hex" -> ${obj}.toHex(args[1])
        "base64" -> ${obj}.toBase64(args[1])
        "sha256" -> ${obj}.sha256(args[1])
        else -> error("unknown operation")
    }
    println(out)
}
`;
 state.artifacts["settings.gradle.kts"]=settings;state.artifacts["build.gradle.kts"]=build;state.artifacts["src/main/kotlin/"+pkg.replaceAll(".","/")+"/Main.kt"]=cli;genKotlin();$("gradle-output").textContent=`--- settings.gradle.kts ---\n${settings}\n--- build.gradle.kts ---\n${build}\n--- Main.kt ---\n${cli}`
};
$("gen-android").onclick=()=>{
 const ns=$("android-ns").value.trim()||"io.zzxlabs.cyberchef.android",pkg=$("package").value.trim()||"io.zzxlabs.cyberchef",obj=$("object").value.trim()||"CyberChef",min=+$("minsdk").value||26;
 const x=`// Android minSdk ${min}
package ${ns}

import ${pkg}.${obj}

class TransformRepository {
    fun fingerprint(text: String): String = ${obj}.sha256(text)
    fun encode(text: String): String = ${obj}.toBase64(text)
}
`;
 state.artifacts["android/TransformRepository.kt"]=x;$("android-output").textContent=x
};
$("vectors").onclick=async()=>{
 const vec=[["toBase64","abc","YWJj"],["toHex","abc","616263"],["sha256","abc","ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"]],out=[];
 for(const [op,input,expected] of vec){const actual=await ChefCore.op(op,input);out.push({op,input,expected,actual,pass:actual===expected})}
 const pkg=$("package").value.trim()||"io.zzxlabs.cyberchef",obj=$("object").value.trim()||"CyberChef";
 const test=`package ${pkg}

import kotlin.test.Test
import kotlin.test.assertEquals

class ${obj}Test {
    @Test fun base64Vector() = assertEquals("YWJj", ${obj}.toBase64("abc"))
    @Test fun hexVector() = assertEquals("616263", ${obj}.toHex("abc"))
    @Test fun shaVector() = assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", ${obj}.sha256("abc"))
}
`;
 state.artifacts["vectors.json"]=JSON.stringify(out,null,2);state.artifacts["src/test/kotlin/"+pkg.replaceAll(".","/")+"/"+obj+"Test.kt"]=test;$("vectors-output").textContent=JSON.stringify({results:out,test:"generated"},null,2)
};
$("export").onclick=()=>{const t=JSON.stringify({schema:"zzx.cyberchefkt.bundle.v1",version:"0.1.0-alpha",artifacts:state.artifacts},null,2);dl(t,"cyberchefkt-bundle.json","application/json");$("export-output").textContent=t};
genKotlin();

runRecipe();
window.CyberChefKotlin=Object.freeze({version:"0.1.0-alpha-web",runRecipe:ChefCore.recipe,getArtifacts:()=>JSON.parse(JSON.stringify(state.artifacts))});
window.ZZXHooks?.emit("cyberchefkt:ready",{version:"0.1.0-alpha-web"});
})();

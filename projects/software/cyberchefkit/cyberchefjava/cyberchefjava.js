(()=>{"use strict";
const $=id=>document.getElementById(id);
const state={last:null,artifacts:{}};
function dl(text,name,type="text/plain"){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),800)}
async function runRecipe(override=null){try{const steps=override||ChefCore.parseRecipe($("recipe").value);state.last=await ChefCore.recipe($("input").value,steps);$("output").value=state.last.output;$("trace").textContent=JSON.stringify({stats:ChefCore.stats($("input").value),trace:state.last.trace},null,2);return state.last}catch(e){$("trace").textContent=`ERROR: ${e.message}`;throw e}}
$("run").onclick=()=>runRecipe();
document.querySelectorAll(".quick").forEach(b=>b.onclick=()=>{const r=[{op:b.dataset.op}];$("recipe").value=JSON.stringify(r,null,2);runRecipe(r)});
$("swap").onclick=()=>{const x=$("input").value;$("input").value=$("output").value;$("output").value=x};
$("clear").onclick=()=>{$("input").value="";$("output").value="";$("trace").textContent=""};

function genJava(){
 const pkg=$("package").value.trim()||"io.zzxlabs.cyberchef",cl=$("class-name").value.trim()||"CyberChef";
 const code=`package ${pkg};

import java.net.URLEncoder;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.HexFormat;

public final class ${cl} {
    private ${cl}() {}

    public static String toHex(String input) {
        return HexFormat.of().formatHex(input.getBytes(StandardCharsets.UTF_8));
    }

    public static String fromHex(String input) {
        return new String(HexFormat.of().parseHex(input), StandardCharsets.UTF_8);
    }

    public static String toBase64(String input) {
        return Base64.getEncoder().encodeToString(input.getBytes(StandardCharsets.UTF_8));
    }

    public static String fromBase64(String input) {
        return new String(Base64.getDecoder().decode(input), StandardCharsets.UTF_8);
    }

    public static String sha256(String input) {
        try {
            var digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(input.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    public static String urlEncode(String input) {
        return URLEncoder.encode(input, StandardCharsets.UTF_8);
    }

    public static String urlDecode(String input) {
        return URLDecoder.decode(input, StandardCharsets.UTF_8);
    }
}
`;
 state.artifacts["src/main/java/"+pkg.replaceAll(".","/")+"/"+cl+".java"]=code;
 $("java-output").textContent=code;return code
}
$("gen-java").onclick=genJava;

$("gen-maven").onclick=()=>{
 const pkg=$("package").value.trim()||"io.zzxlabs.cyberchef",cl=$("class-name").value.trim()||"CyberChef",artifact=$("artifact").value.trim()||"cyberchefjava",ver=$("artifact-version").value.trim()||"0.1.0-alpha",jv=$("java-version").value;
 const pom=`<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>io.zzxlabs</groupId>
  <artifactId>${artifact}</artifactId>
  <version>${ver}</version>
  <properties><maven.compiler.release>${jv}</maven.compiler.release></properties>
  <dependencies>
    <dependency>
      <groupId>org.junit.jupiter</groupId><artifactId>junit-jupiter</artifactId><version>5.11.0</version><scope>test</scope>
    </dependency>
  </dependencies>
</project>
`;
 const cli=`package ${pkg};

public final class Main {
    public static void main(String[] args) {
        if (args.length < 2) {
            System.err.println("usage: cyberchefjava <hex|base64|sha256> <input>");
            System.exit(2);
        }
        String out = switch (args[0]) {
            case "hex" -> ${cl}.toHex(args[1]);
            case "base64" -> ${cl}.toBase64(args[1]);
            case "sha256" -> ${cl}.sha256(args[1]);
            default -> throw new IllegalArgumentException("unknown operation");
        };
        System.out.println(out);
    }
}
`;
 state.artifacts["pom.xml"]=pom;state.artifacts["src/main/java/"+pkg.replaceAll(".","/")+"/Main.java"]=cli;genJava();
 $("maven-output").textContent=`--- pom.xml ---\n${pom}\n--- Main.java ---\n${cli}`
};

$("gen-android").onclick=()=>{
 const pkg=$("package").value.trim()||"io.zzxlabs.cyberchef",cl=$("class-name").value.trim()||"CyberChef",ap=$("android-package").value.trim()||"io.zzxlabs.cyberchef.android",min=Math.max(21,+$("min-api").value||26);
 const snippet=`// minSdk ${min}
package ${ap};

import ${pkg}.${cl};

public final class TransformExample {
    public static String fingerprint(String text) {
        return ${cl}.sha256(text);
    }

    public static String encodeForTransfer(String text) {
        return ${cl}.toBase64(text);
    }
}
`;
 state.artifacts["android/TransformExample.java"]=snippet;$("android-output").textContent=snippet
};

$("vectors").onclick=async()=>{
 const vec=[["toBase64","abc","YWJj"],["toHex","abc","616263"],["sha256","abc","ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"]],out=[];
 for(const [op,input,expected] of vec){const actual=await ChefCore.op(op,input);out.push({op,input,expected,actual,pass:actual===expected})}
 const pkg=$("package").value.trim()||"io.zzxlabs.cyberchef",cl=$("class-name").value.trim()||"CyberChef";
 const junit=`package ${pkg};

import static org.junit.jupiter.api.Assertions.assertEquals;
import org.junit.jupiter.api.Test;

final class ${cl}Test {
    @Test void base64Vector(){ assertEquals("YWJj", ${cl}.toBase64("abc")); }
    @Test void hexVector(){ assertEquals("616263", ${cl}.toHex("abc")); }
    @Test void shaVector(){ assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", ${cl}.sha256("abc")); }
}
`;
 state.artifacts["vectors.json"]=JSON.stringify(out,null,2);state.artifacts["src/test/java/"+pkg.replaceAll(".","/")+"/"+cl+"Test.java"]=junit;$("vectors-output").textContent=JSON.stringify({results:out,junit:"generated"},null,2)
};

$("export").onclick=()=>{const t=JSON.stringify({schema:"zzx.cyberchefjava.bundle.v1",version:"0.1.0-alpha",artifacts:state.artifacts},null,2);dl(t,"cyberchefjava-bundle.json","application/json");$("export-output").textContent=t};
genJava();

runRecipe();
window.CyberChefJava=Object.freeze({version:"0.1.0-alpha-web",runRecipe:ChefCore.recipe,getArtifacts:()=>JSON.parse(JSON.stringify(state.artifacts))});
window.ZZXHooks?.emit("cyberchefjava:ready",{version:"0.1.0-alpha-web"});
})();

(() => {
  "use strict";
  const te=new TextEncoder();

  function canonical(v){
    if(Array.isArray(v))return`[${v.map(canonical).join(",")}]`;
    if(v&&typeof v==="object")return`{${Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canonical(v[k])).join(",")}}`;
    return JSON.stringify(v);
  }

  async function sha256Hex(value){
    const d=await crypto.subtle.digest("SHA-256",te.encode(typeof value==="string"?value:canonical(value)));
    return[...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("");
  }

  function lineDiff(a,b){
    const A=String(a).split(/\r?\n/),B=String(b).split(/\r?\n/),m=A.length,n=B.length;
    const dp=Array.from({length:m+1},()=>new Uint16Array(n+1));
    for(let i=m-1;i>=0;i--)for(let j=n-1;j>=0;j--)dp[i][j]=A[i]===B[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
    const out=[];let i=0,j=0;
    while(i<m||j<n){
      if(i<m&&j<n&&A[i]===B[j]){out.push(`  ${A[i]}`);i++;j++;}
      else if(j<n&&(i===m||dp[i][j+1]>=dp[i+1][j])){out.push(`+ ${B[j++]}`);}
      else if(i<m){out.push(`- ${A[i++]}`);}
    }
    return out.join("\n");
  }

  function escapePdf(s){return String(s).replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)");}
  function pdfBytes(title,lines){
    const wrapped=[];
    for(const raw of [title,"",...lines]){
      let s=String(raw).replace(/[^\x20-\x7E]/g,"?");
      if(!s){wrapped.push("");continue;}
      while(s.length>92){wrapped.push(s.slice(0,92));s=s.slice(92);}
      wrapped.push(s);
    }
    const pageLines=wrapped.slice(0,58);
    let y=760,stream="BT\n/F1 10 Tf\n";
    for(const line of pageLines){stream+=`1 0 0 1 42 ${y} Tm (${escapePdf(line)}) Tj\n`;y-=12;}
    stream+="ET\n";
    const objs=[];
    objs[1]="<< /Type /Catalog /Pages 2 0 R >>";
    objs[2]="<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
    objs[3]="<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>";
    objs[4]=`<< /Length ${stream.length} >>\nstream\n${stream}endstream`;
    objs[5]="<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
    let pdf="%PDF-1.4\n",offsets=[0];
    for(let i=1;i<=5;i++){offsets[i]=pdf.length;pdf+=`${i} 0 obj\n${objs[i]}\nendobj\n`;}
    const xref=pdf.length;pdf+="xref\n0 6\n0000000000 65535 f \n";
    for(let i=1;i<=5;i++)pdf+=String(offsets[i]).padStart(10,"0")+" 00000 n \n";
    pdf+=`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return new TextEncoder().encode(pdf);
  }

  window.BitContractorCore=Object.freeze({canonical,sha256Hex,lineDiff,pdfBytes});
})();

(function(){
  const form=document.querySelector("#cfg-form");
  const btn=document.querySelector("#gen-btn");
  const out=document.querySelector("#output");

  const buildConf=(data)=>{
    let cfg="";
    for(const [k,v] of Object.entries(data)){
      if(v!=="" && v!=null) cfg+=`${k}=${v}\n`;
    }
    return cfg.trim();
  };

  btn.addEventListener("click",()=>{
    const fd=new FormData(form);
    const cfg={};
    for(const [k,v] of fd.entries()) cfg[k]=v;
    out.value=buildConf(cfg);
  });
})();

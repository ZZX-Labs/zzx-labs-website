(function(){
  "use strict";
  const W=window;
  if(W.ZZXBTCCommitsModel?.__version>=1)return;
  const firstLine=m=>String(m||"").split(/\r?\n/,1)[0].trim()||"(no commit message)";
  function one(row){
    const c=row?.commit||row||{},a=c?.author||{},cm=c?.committer||{};
    return {
      sha:String(row?.sha||row?.id||""),
      shortSha:String(row?.sha||row?.id||"").slice(0,12),
      message:firstLine(c.message??row?.message),
      author:String(row?.author?.login||row?.committer?.login||a.name||cm.name||"unknown"),
      date:a.date||cm.date||row?.date||row?.committed_at||null,
      url:row?.html_url||row?.url||null
    };
  }
  function rows(payload){
    if(Array.isArray(payload))return payload.map(one);
    if(Array.isArray(payload?.commits))return payload.commits.map(one);
    if(Array.isArray(payload?.items))return payload.items.map(one);
    return [];
  }
  function build(payload,now=Date.now()){
    const list=rows(payload).filter(x=>x.sha&&x.date&&Number.isFinite(new Date(x.date).getTime())).sort((a,b)=>new Date(b.date)-new Date(a.date));
    if(!list.length)throw new Error("no Bitcoin Core commits available");
    const day=86400000;
    return {
      rows:list,latest:list[0],
      count24:list.filter(x=>now-new Date(x.date).getTime()<=day).length,
      count7d:list.filter(x=>now-new Date(x.date).getTime()<=7*day).length,
      authorCount:new Set(list.map(x=>x.author).filter(Boolean)).size,
      sampleSize:list.length,sampleLimited:list.length>=100
    };
  }
  W.ZZXBTCCommitsModel=Object.freeze({__version:1,build});
})();

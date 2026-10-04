// __partials/widgets/btc-commits/js/model.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXBitcoinCommitModel?.__version||0)>=1)return;

  function build(input){
    const now=Date.now();

    const rows=(input||[]).map(row=>{
      const commit=row.commit||row;
      const author=commit.author||{};
      const ghAuthor=row.author||{};

      return {
        sha:String(row.sha||commit.sha||""),
        shortSha:String(row.sha||commit.sha||"").slice(0,8),
        message:String(commit.message||row.message||"").split("\n")[0],
        url:String(row.html_url||row.url||""),
        author:String(ghAuthor.login||author.name||row.author_name||"unknown"),
        date:Date.parse(author.date||row.date||row.timestamp||"")||0
      };
    }).filter(row=>row.sha).sort((a,b)=>b.date-a.date);

    const authors=new Set(rows.map(row=>row.author).filter(Boolean));

    return Object.freeze({
      schema:"zzx-bitcoin-core-commit-model-v1",
      rows:Object.freeze(rows.map(Object.freeze)),
      latest:rows[0]||null,
      counts:Object.freeze({
        h24:rows.filter(row=>row.date&&now-row.date<=86400000).length,
        d7:rows.filter(row=>row.date&&now-row.date<=7*86400000).length,
        authors:authors.size,
        size:rows.length
      })
    });
  }

  W.ZZXBitcoinCommitModel=Object.freeze({__version:1,build});
})();

// __partials/widgets/btc-prs/js/ui.js
(function(){
  "use strict";
  const W=window,D=document;
  if(Number(W.ZZXBitcoinPRUI?.__version||0)>=1)return;

  function render(container,rows){
    container.replaceChildren();
    for(const row of rows){
      const item=D.createElement("article");item.className="btc-prs__item";

      const num=D.createElement("span");num.className="btc-prs__number";num.textContent=`#${row.number}`;

      const body=D.createElement("div");body.className="btc-prs__body";
      const title=D.createElement("a");title.className="btc-prs__title";
      title.textContent=row.title;title.href=row.url;title.target="_blank";title.rel="noopener noreferrer";

      const meta=D.createElement("div");meta.className="btc-prs__meta";
      const updated=row.updatedAt?new Date(row.updatedAt).toLocaleString():"unknown time";
      meta.textContent=`${row.author} · ${row.head||"?"} → ${row.base||"?"} · ${updated}${row.draft?" · draft":""}`;

      const state=D.createElement("span");state.className="btc-prs__state";
      state.dataset.state=row.state;state.textContent=row.state;

      body.append(title,meta);item.append(num,body,state);container.appendChild(item);
    }
  }

  W.ZZXBitcoinPRUI=Object.freeze({__version:1,render});
})();

// __partials/widgets/btc-commits/js/ui.js
(function(){
  "use strict";

  const W=window,D=document;
  if(Number(W.ZZXBitcoinCommitUI?.__version||0)>=1)return;

  function render(container,rows){
    container.replaceChildren();

    for(const row of rows){
      const item=D.createElement("div");
      item.className="btc-commits__item";

      const sha=D.createElement("a");
      sha.className="btc-commits__sha";
      sha.href=row.url;
      sha.target="_blank";
      sha.rel="noopener noreferrer";
      sha.textContent=row.shortSha;

      const message=D.createElement("span");
      message.className="btc-commits__message";
      message.textContent=row.message||"(no commit message)";

      const who=D.createElement("span");
      who.className="btc-commits__who";
      const when=row.date?new Date(row.date).toLocaleString():"unknown";
      who.textContent=`${row.author} · ${when}`;

      item.append(sha,message,who);
      container.appendChild(item);
    }
  }

  W.ZZXBitcoinCommitUI=Object.freeze({__version:1,render});
})();

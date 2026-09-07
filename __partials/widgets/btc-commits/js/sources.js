(function(){
  "use strict";
  const W=window;
  if(W.ZZXBTCCommitsSources?.__version>=1)return;
  W.ZZXBTCCommitsSources=Object.freeze({
    __version:1,
    local:"/bitcoin/bpi/api/btc_commits.json",
    github:"https://api.github.com/repos/bitcoin/bitcoin/commits?per_page=100",
    repository:"https://github.com/bitcoin/bitcoin",
    allOrigins:"https://api.allorigins.win/raw?url="
  });
})();

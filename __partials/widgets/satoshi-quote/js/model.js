// __partials/widgets/satoshi-quote/js/model.js
(function(){
  "use strict";

  const W=window;
  if(W.ZZXSatoshiQuoteModel?.__version>=3)return;

  function clean(value){
    return String(value??"").trim();
  }

  function kindOf(item){
    if(item?.whitepaper===true)return "whitepaper";
    if(item?.email_id!=null)return "email";
    if(item?.post_id!=null)return "post";
    return "other";
  }

  function normalize(data){
    if(!Array.isArray(data))return [];

    return data
      .map((item,index)=>{
        if(!item||typeof item!=="object")return null;

        const text=clean(item.text);
        if(!text)return null;

        const categories=Array.isArray(item.categories)
          ? [...new Set(
              item.categories
                .map(clean)
                .filter(Boolean)
            )]
          : [];

        return {
          index,
          text,
          date:clean(item.date),
          categories,
          postId:item.post_id!=null?String(item.post_id):"",
          emailId:item.email_id!=null?String(item.email_id):"",
          whitepaper:item.whitepaper===true,
          kind:kindOf(item)
        };
      })
      .filter(Boolean);
  }

  function sourceLabel(item){
    if(!item)return "Satoshi Nakamoto";

    if(item.whitepaper){
      return "Satoshi Nakamoto · Bitcoin whitepaper";
    }

    if(item.kind==="email"){
      return item.emailId
        ? `Satoshi Nakamoto · email ${item.emailId}`
        : "Satoshi Nakamoto · email";
    }

    if(item.kind==="post"){
      return item.postId
        ? `Satoshi Nakamoto · forum post ${item.postId}`
        : "Satoshi Nakamoto · forum post";
    }

    return "Satoshi Nakamoto";
  }

  function sourceUrl(item){
    return item?.whitepaper
      ? W.ZZXSatoshiQuoteSources.whitepaperUrl
      : W.ZZXSatoshiQuoteSources.archiveUrl;
  }

  function categories(items){
    const set=new Set();

    for(const item of items||[]){
      for(const category of item.categories||[]){
        set.add(category);
      }
    }

    return [...set].sort((a,b)=>a.localeCompare(b));
  }

  function filter(items,kind,category){
    return (items||[]).filter(item=>{
      const kindOk=!kind||kind==="all"||item.kind===kind;
      const categoryOk=
        !category ||
        category==="all" ||
        item.categories.includes(category);

      return kindOk&&categoryOk;
    });
  }

  W.ZZXSatoshiQuoteModel=Object.freeze({
    __version:3,
    kindOf,
    normalize,
    sourceLabel,
    sourceUrl,
    categories,
    filter
  });
})();

// __partials/widgets/nodes-by-asn/js/model.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXNodesByAsnModel?.__version||0)>=2)return;

  function text(value){
    return String(value??"").trim();
  }

  function finite(value){
    const n=Number(value);
    return Number.isFinite(n)?n:NaN;
  }

  function normalizeAsn(value){
    let s=text(value).toUpperCase().replace(/\s+/g,"");
    if(/^\d+$/.test(s))s=`AS${s}`;
    return /^AS\d+$/.test(s)?s:"";
  }

  function asnNumber(value){
    const asn=normalizeAsn(value);
    return asn?Number(asn.slice(2)):NaN;
  }

  function countryMeta(node){
    if(W.ZZXBitnodes?.countryMeta){
      return W.ZZXBitnodes.countryMeta(
        node?.country,
        node?.countryName,
        node?.countryFlag
      );
    }

    const code=text(node?.country).toUpperCase();
    const located=/^[A-Z]{2}$/.test(code);

    let name=located?(text(node?.countryName)||code):"Unlocated";
    let flag=located?text(node?.countryFlag):"";

    if(located){
      try{
        if(!node?.countryName&&typeof Intl?.DisplayNames==="function"){
          name=new Intl.DisplayNames(["en"],{type:"region"}).of(code)||code;
        }
      }catch(_){}
      if(!flag){
        flag=String.fromCodePoint(...[...code].map(ch=>127397+ch.charCodeAt(0)));
      }
    }

    return {
      code:located?code:"--",
      name:located?name:"Unlocated",
      flag:located?(flag||"🏴"):"🏴",
      located,
      label:located?`${flag||""} ${name} · ${code}`.trim():"🏴 Unlocated · --"
    };
  }

  function denominator(snapshot,nodes){
    const candidates=[
      snapshot?.reachableNodes,
      snapshot?.reachable_nodes,
      snapshot?.totalNodes,
      snapshot?.total_nodes,
      snapshot?.nodeCount,
      snapshot?.node_count,
      nodes.length
    ];

    for(const candidate of candidates){
      const n=finite(candidate);
      if(n>0)return n;
    }
    return 0;
  }

  function build(snapshot){
    const nodes=Array.isArray(snapshot?.nodes)?snapshot.nodes:[];
    const total=denominator(snapshot,nodes);

    const rowMap=new Map();
    const asnTotals=new Map();
    const organizations=new Set();
    const countries=new Set();

    let observed=0;
    let located=0;

    for(const node of nodes){
      const asn=normalizeAsn(node?.asn);
      if(!asn)continue;

      observed+=1;

      const organization=text(node?.organization)||"Unknown organization";
      organizations.add(organization);

      const nation=countryMeta(node);
      if(nation.located){
        located+=1;
        countries.add(nation.code);
      }

      const rowKey=`${asn}|${organization.toLowerCase()}|${nation.code}`;
      const row=rowMap.get(rowKey)||{
        asn,
        asnNumber:asnNumber(asn),
        organization,
        country:nation.located?nation.code:"",
        countryName:nation.name,
        flag:nation.flag,
        nationLabel:nation.label,
        located:nation.located,
        nodes:0
      };
      row.nodes+=1;
      rowMap.set(rowKey,row);

      const asnKey=`${asn}|${organization.toLowerCase()}`;
      const aggregate=asnTotals.get(asnKey)||{
        asn,
        asnNumber:asnNumber(asn),
        organization,
        nodes:0,
        countries:new Set()
      };
      aggregate.nodes+=1;
      if(nation.located)aggregate.countries.add(nation.code);
      asnTotals.set(asnKey,aggregate);
    }

    const identifiedDenominator=observed;

    const rows=[...rowMap.values()].sort((a,b)=>
      b.nodes-a.nodes ||
      a.asnNumber-b.asnNumber ||
      a.organization.localeCompare(b.organization) ||
      a.country.localeCompare(b.country)
    );

    for(const row of rows){
      row.share=total>0?row.nodes/total:NaN;
      row.asnShare=identifiedDenominator>0?row.nodes/identifiedDenominator:NaN;
      Object.freeze(row);
    }

    const leaders=[...asnTotals.values()]
      .map(item=>Object.freeze({
        asn:item.asn,
        asnNumber:item.asnNumber,
        organization:item.organization,
        nodes:item.nodes,
        countryCount:item.countries.size,
        share:total>0?item.nodes/total:NaN,
        asnShare:identifiedDenominator>0?item.nodes/identifiedDenominator:NaN
      }))
      .sort((a,b)=>
        b.nodes-a.nodes ||
        a.asnNumber-b.asnNumber ||
        a.organization.localeCompare(b.organization)
      );

    const unidentified=Math.max(0,total-observed);
    const coverage=total>0?observed/total:NaN;
    const locatedShare=observed>0?located/observed:NaN;

    return Object.freeze({
      schema:"zzx-nodes-by-asn-model-v2",
      rows:Object.freeze(rows),
      leaders:Object.freeze(leaders),
      asnCount:leaders.length,
      organizationCount:organizations.size,
      countryCount:countries.size,
      observed,
      located,
      unidentified,
      denominator:total,
      coverage,
      locatedShare,
      top:leaders[0]||null
    });
  }

  W.ZZXNodesByAsnModel=Object.freeze({
    __version:2,
    normalizeAsn,
    asnNumber,
    build
  });
})();

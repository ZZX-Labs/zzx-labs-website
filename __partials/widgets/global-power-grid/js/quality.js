// __partials/widgets/global-power-grid/js/quality.js
(function(){
  "use strict";

  const W=window;
  if(Number(W.ZZXGlobalPowerGridQuality?.__version||0)>=1)return;

  function finite(value){
    if(value===null||value===undefined)return NaN;
    if(typeof value==="string"&&!value.trim())return NaN;
    const n=Number(value);
    return Number.isFinite(n)?n:NaN;
  }

  function iso(value){
    const text=String(value||"").trim().toUpperCase();
    return /^[A-Z]{2}$/.test(text)?text:"";
  }

  function edition(value){
    const n=finite(value);
    return Number.isFinite(n)&&n>=1962&&n<=2025?Math.round(n):NaN;
  }

  function positiveOrMissing(value){
    const n=finite(value);
    return !Number.isFinite(n)||n>=0;
  }

  function marker(row){
    const q=row?.quality;
    const status=String(q?.status??row?.quality_status??"").toLowerCase();
    const parser=Number(q?.parser_version??row?.parser_version??0);
    const basis=String(q?.country_basis??row?.country_basis??"");
    const verified=
      row?.verified===true ||
      status==="verified" ||
      status==="accepted";

    return {verified,parser,basis,status};
  }

  function assessFactbookRecord(row){
    const country=iso(row?.country??row?.iso);
    if(!country)return {accepted:false,reason:"invalid-country"};

    const year=edition(row?.edition_year??row?.year);
    if(!Number.isFinite(year))return {accepted:false,reason:"invalid-edition-year"};

    const values=[
      row?.electricity_generation_kwh??row?.generation_kwh,
      row?.electricity_consumption_kwh??row?.consumption_kwh,
      row?.installed_capacity_kw??row?.capacity_kw
    ];

    if(!values.some(value=>Number.isFinite(finite(value)))){
      const mix=row?.generation_by_source_pct??row?.mix;
      if(!mix||typeof mix!=="object"||!Object.keys(mix).length){
        return {accepted:false,reason:"no-electricity-fields"};
      }
    }

    if(!values.every(positiveOrMissing)){
      return {accepted:false,reason:"negative-electricity-field"};
    }

    const mark=marker(row);

    // v1 archive rows did not retain enough evidence to prove that a value
    // belonged to the country assigned to it. That is exactly how whole-book
    // OCR values were attached to the wrong nations. Never silently promote
    // those rows into the production grid model.
    if(!mark.verified){
      return {accepted:false,reason:"legacy-unverified-country-attribution"};
    }

    // The fixed crawler emits one of these strong attribution bases. Manual
    // records may explicitly use "manual-verified".
    const strong=new Set([
      "page-title",
      "country-page-heading",
      "book-section-heading",
      "filename-country",
      "manual-verified"
    ]);

    if(mark.basis&&!strong.has(mark.basis)){
      return {accepted:false,reason:`unsupported-country-basis:${mark.basis}`};
    }

    return {
      accepted:true,
      reason:"verified",
      country,
      editionYear:year,
      parserVersion:mark.parser,
      countryBasis:mark.basis||"manual-verified"
    };
  }

  function filterFactbook(payload){
    const input=Array.isArray(payload?.records)?payload.records:[];
    const records=[];
    const rejected=[];
    const reasons={};

    for(const row of input){
      const result=assessFactbookRecord(row);
      if(result.accepted){
        records.push(row);
      }else{
        const reason=result.reason||"rejected";
        reasons[reason]=(reasons[reason]||0)+1;
        rejected.push({
          country:String(row?.country||""),
          edition_year:row?.edition_year??row?.year??null,
          reason
        });
      }
    }

    return {
      payload:{
        ...(payload&&typeof payload==="object"?payload:{}),
        records
      },
      summary:{
        inputRecords:input.length,
        acceptedRecords:records.length,
        rejectedRecords:rejected.length,
        reasons,
        rejected
      }
    };
  }

  function scoreFactbook(payload){
    const result=filterFactbook(payload);
    return result.summary.acceptedRecords;
  }

  function scoreRegistry(payload){
    return Array.isArray(payload?.countries)?payload.countries.length:0;
  }

  function scoreLive(payload){
    const rows=Array.isArray(payload?.countries)?payload.countries:[];
    let score=rows.length;
    for(const row of rows){
      if(Array.isArray(row?.hourly))score+=row.hourly.length*0.01;
    }
    return score;
  }

  W.ZZXGlobalPowerGridQuality=Object.freeze({
    __version:1,
    assessFactbookRecord,
    filterFactbook,
    scoreFactbook,
    scoreRegistry,
    scoreLive
  });
})();

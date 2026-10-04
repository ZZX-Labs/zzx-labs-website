(()=>{"use strict";
const LC={};
LC.SYNODIC=29.530588853;
LC.DAY=86400000;
LC.REF_NEW=Date.UTC(2000,0,6,18,14,0); // common reference new moon
LC.mod=(n,m)=>((n%m)+m)%m;
LC.jd=ms=>ms/86400000+2440587.5;
LC.phaseName=f=>{
 const names=["New Moon","Waxing Crescent","First Quarter","Waxing Gibbous","Full Moon","Waning Gibbous","Last Quarter","Waning Crescent"];
 return names[Math.floor((LC.mod(f,1)*8)+0.5)%8];
};
LC.calc=date=>{
 const ms=date.getTime(), age=LC.mod((ms-LC.REF_NEW)/LC.DAY,LC.SYNODIC);
 const frac=age/LC.SYNODIC, angle=frac*Math.PI*2;
 const illum=(1-Math.cos(angle))/2;
 const lunation=Math.floor((ms-LC.REF_NEW)/LC.DAY/LC.SYNODIC);
 const synRemaining=LC.SYNODIC-age;
 const quarterAges=[0,LC.SYNODIC/4,LC.SYNODIC/2,LC.SYNODIC*3/4,LC.SYNODIC];
 let nextAge=quarterAges.find(x=>x>age+1e-9); if(nextAge===undefined) nextAge=LC.SYNODIC;
 const nextQuarterIn=nextAge-age;
 const nextQuarterFrac=LC.mod(nextAge/LC.SYNODIC,1);
 // Approximate 18.6-year nodal/standstill phase anchored near 2025 major standstill.
 const tropicalYear=365.2422, nodalYears=18.613;
 const anchor=Date.UTC(2025,0,1);
 const nodalPhase=LC.mod((ms-anchor)/LC.DAY/(tropicalYear*nodalYears),1);
 const nodalAngle=nodalPhase*360;
 const standstillType=Math.cos(nodalPhase*Math.PI*2)>=0?"major-leaning":"minor-leaning";
 // Eclipse-season proximity: eclipse seasons recur ~173.31 days.
 const eclipseSeason=173.31;
 const eRef=Date.UTC(2024,2,25); // approximate 2024 eclipse-season reference
 const epos=LC.mod((ms-eRef)/LC.DAY,eclipseSeason);
 const dist=Math.min(epos,eclipseSeason-epos);
 return {
   iso:date.toISOString(),julianDate:LC.jd(ms),ageDays:age,phaseFraction:frac,
   phaseName:LC.phaseName(frac),illumination:illum,lunation,
   daysToNextNew:synRemaining,daysToNextQuarter:nextQuarterIn,nextQuarterName:LC.phaseName(nextQuarterFrac),
   nodalCyclePhase:nodalPhase,nodalAngleDeg:nodalAngle,standstillModel:standstillType,
   eclipseSeasonDistanceDays:dist,eclipseSeasonNear:dist<18
 };
};
LC.nextByDays=(d,days)=>new Date(d.getTime()+days*LC.DAY);
window.LunarClockCore=Object.freeze(LC);
})();

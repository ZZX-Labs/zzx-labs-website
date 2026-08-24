(() => {
  "use strict";
  function clamp(v,a=0,b=100){return Math.max(a,Math.min(b,Number(v)||0));}
  function levelForXp(xp){return 1+Math.floor(Math.sqrt(Math.max(0,xp)/100));}
  async function seedHex(text){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(text)));return[...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("");}
  async function traits(name,species,chainRef){
    const seed=await seedHex(`${name}|${species}|${chainRef}`);
    const colors=["amber","olive","charcoal","copper","ivory","rust","sage","gold"];
    const temper=["curious","stoic","mischievous","focused","loyal","restless","calm","bold"];
    const affinity=["mempool","lightning","mining","UTXO","privacy","signatures","timelocks","blocks"];
    const pick=(arr,off)=>arr[parseInt(seed.slice(off,off+2),16)%arr.length];
    return{seed,color:pick(colors,0),temperament:pick(temper,2),affinity:pick(affinity,4),rarityScore:parseInt(seed.slice(6,10),16)%10000};
  }
  function action(pet,type){const p={...pet};if(type==="train"&&p.energy>=10){p.energy-=10;p.xp+=25;p.discipline=clamp(p.discipline+4);p.happiness=clamp(p.happiness-1);}else if(type==="play"&&p.energy>=5){p.energy-=5;p.xp+=8;p.happiness=clamp(p.happiness+8);}else if(type==="rest"){p.energy=clamp(p.energy+20);p.happiness=clamp(p.happiness+2);}p.level=levelForXp(p.xp);return p;}
  function applyLightning(pet,event){const p={...pet},s=Math.max(0,Number(event.amountSats)||0),boost=Math.max(1,Math.min(50,Math.floor(Math.log2(s+1))));if(event.type==="treat"){p.happiness=clamp(p.happiness+boost);p.energy=clamp(p.energy+Math.ceil(boost/2));}if(event.type==="training"){p.xp+=boost*3;p.discipline=clamp(p.discipline+boost);}if(event.type==="collectible"){p.collectiblePoints=(p.collectiblePoints||0)+boost;}p.level=levelForXp(p.xp);return p;}
  window.BitPetCore=Object.freeze({clamp,levelForXp,seedHex,traits,action,applyLightning});
})();

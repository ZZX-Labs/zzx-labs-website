(() => {
  "use strict";
  const te=new TextEncoder();
  function hex(b){return[...b].map(x=>x.toString(16).padStart(2,"0")).join("");}
  function randomHex(n=32){const b=crypto.getRandomValues(new Uint8Array(n));return hex(b);}
  async function sha256Hex(text){return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",te.encode(String(text)))));}
  async function hmacHex(keyText,msg){const key=await crypto.subtle.importKey("raw",te.encode(keyText),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return hex(new Uint8Array(await crypto.subtle.sign("HMAC",key,te.encode(msg))));}
  async function draw(serverSeed,playerSeed,game){
    const digest=await hmacHex(serverSeed,`${game.id}|${game.type}|${playerSeed}`);
    const n=parseInt(digest.slice(0,13),16);
    let result;if(game.type==="coin")result=n%2===0?"HEADS":"TAILS";else if(game.type==="dice")result=n%6+1;else result=n%game.max+1;
    return{digest,result};
  }
  window.BitBettingCore=Object.freeze({randomHex,sha256Hex,hmacHex,draw});
})();

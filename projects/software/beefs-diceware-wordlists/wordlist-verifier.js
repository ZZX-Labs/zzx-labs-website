(() => {
  "use strict";

  function pemBytes(pem) {
    const b64=String(pem).replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s+/g,"");
    if(!b64)throw new Error("Public key PEM is empty.");
    const raw=atob(b64);
    return Uint8Array.from(raw,c=>c.charCodeAt(0));
  }

  function signatureBytes(text) {
    const s=String(text).trim().replace(/\s+/g,"");
    if(/^[0-9a-f]+$/i.test(s)&&s.length%2===0) {
      return Uint8Array.from(s.match(/../g)||[],x=>parseInt(x,16));
    }
    const raw=atob(s);
    return Uint8Array.from(raw,c=>c.charCodeAt(0));
  }

  async function verifyEd25519(dataBytes,pem,signatureText) {
    if(!crypto.subtle)throw new Error("Web Crypto unavailable.");
    const key=await crypto.subtle.importKey("spki",pemBytes(pem),{name:"Ed25519"},false,["verify"]);
    return crypto.subtle.verify({name:"Ed25519"},key,signatureBytes(signatureText),dataBytes);
  }

  async function sha256Hex(bytes) {
    const d=await crypto.subtle.digest("SHA-256",bytes);
    return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("");
  }

  window.DicewareVerifier=Object.freeze({verifyEd25519,sha256Hex});
})();

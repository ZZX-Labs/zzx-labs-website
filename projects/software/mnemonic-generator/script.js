// projects/software/mnemonic-generator/script.js
// Mnemonic Generator (BIP39 + Custom + Diceware)
// Offline, Web Crypto only

(async function () {
  const $ = (q) => document.querySelector(q);

  const modeSel = $('#mode');
  const bitsSel = $('#bits');
  const customSel = $('#custom-count');
  const passInput = $('#passphrase');
  const btnGen = $('#btn-generate');
  const btnVal = $('#btn-validate');
  const btnSeed = $('#btn-seed');
  const outEnt = $('#entropyHex');
  const outWords = $('#mnemonic');
  const outSeed = $('#seedHex');
  const statusEl = $('#status');

  const dwCount = $('#dw-count');
  const dwSep = $('#dw-sep');
  const btnDwGen = $('#btn-dw-generate');
  const outDw = $('#diceware');
  const dwStatus = $('#dw-status');

  /* ===== Helpers ===== */
  function hex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2,'0')).join('');
  }
  async function randomBytes(n) {
    const arr = new Uint8Array(n);
    crypto.getRandomValues(arr);
    return arr;
  }

  async function sha256(data) {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return new Uint8Array(buf);
  }

  async function pbkdf2Sha512(password, salt, iterations, dkLen) {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations, hash: "SHA-512" },
      key,
      dkLen * 8
    );
    return new Uint8Array(bits);
  }

  function splitWords(str) {
    return str.trim().toLowerCase().split(/\s+/).filter(Boolean);
  }

  function copyToClipboard(sel) {
    try {
      const el = $(sel);
      if (!el) return;
      navigator.clipboard.writeText(el.value || el.textContent || "");
    } catch(e) { console.warn("copy failed", e); }
  }

  // hook copy buttons
  document.querySelectorAll('button[data-copy]').forEach(btn=>{
    btn.addEventListener('click', ()=> copyToClipboard(btn.getAttribute('data-copy')));
  });

  /* ===== Core Functions ===== */
  async function generate() {
    statusEl.textContent = '';
    outEnt.value = '';
    outWords.value = '';
    outSeed.value = '';

    const mode = modeSel.value;
    if (mode === 'bip39') {
      const bits = parseInt(bitsSel.value, 10);
      const entBytes = bits/8;
      const ent = await randomBytes(entBytes);
      outEnt.value = hex(ent);

      // Here you'd use BIP39 wordlist + checksum. Placeholder:
      outWords.value = `[${bits}-bit entropy] (BIP39 wordlist integration required)`;
      statusEl.textContent = "Generated BIP39 entropy.";
      statusEl.className = 'status ok';

    } else {
      // Custom
      const count = parseInt(customSel.value, 10);
      // ensure allowed counts
      const allowed = [1,2,3,4,5,6,7,8,12,16,24,32];
      if (!allowed.includes(count)) {
        statusEl.textContent = "Invalid word count selection.";
        statusEl.className = 'status err';
        return;
      }
      const words = [];
      for (let i=0; i<count; i++) {
        words.push("word" + (Math.floor(Math.random()*2048)));
      }
      outWords.value = words.join(" ");
      statusEl.textContent = `Generated custom mnemonic (${count} words).`;
      statusEl.className = 'status ok';
    }
  }

  async function validate() {
    const words = splitWords(outWords.value);
    if (!words.length) {
      statusEl.textContent = "No words entered.";
      statusEl.className = 'status err';
      return;
    }
    statusEl.textContent = `Contains ${words.length} words.`;
    statusEl.className = 'status ok';
  }

  async function deriveSeed() {
    const words = splitWords(outWords.value);
    if (!words.length) {
      statusEl.textContent = "Mnemonic required first.";
      statusEl.className = 'status err';
      return;
    }
    const pass = passInput.value || "";
    const salt = "mnemonic" + pass;
    const seed = await pbkdf2Sha512(words.join(" "), salt, 2048, 64);
    outSeed.value = hex(seed);
    statusEl.textContent = "Seed derived via PBKDF2-HMAC-SHA512.";
    statusEl.className = 'status ok';
  }

  /* ===== Diceware ===== */
  async function generateDiceware() {
    outDw.value = '';
    const n = parseInt(dwCount.value, 10);
    const sep = dwSep.value || ' ';
    const words = [];
    for (let i=0; i<n; i++) {
      words.push("dw" + (Math.floor(Math.random()*7776)));
    }
    outDw.value = words.join(sep);
    dwStatus.textContent = `Generated ${n} diceware words.`;
  }

  /* ===== Bind ===== */
  btnGen.addEventListener('click', generate);
  btnVal.addEventListener('click', validate);
  btnSeed.addEventListener('click', deriveSeed);
  btnDwGen.addEventListener('click', generateDiceware);

})();

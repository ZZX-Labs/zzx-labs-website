const API_URL = 'https://api.coinbase.com/v2/prices/spot?currency=USD';

let timer = null;

function getEls() {
  return {
    btc:  document.getElementById('btc-value'),
    mbtc: document.getElementById('mbtc-value'),
    ubtc: document.getElementById('ubtc-value'),
    sat:  document.getElementById('sats-value'),
  };
}

async function updateTicker() {
  const { btc, mbtc, ubtc, sat } = getEls();
  if (!btc || !mbtc || !ubtc || !sat) return; // fragment not mounted yet

  try {
    const r = await fetch(API_URL);
    const data = await r.json();
    const btcPrice = parseFloat(data.data.amount);

    const m = btcPrice * 0.001;
    const u = btcPrice * 0.000001;
    const s = btcPrice * 0.00000001;

    btc.textContent  = btcPrice.toFixed(2);
    mbtc.textContent = m.toFixed(2);
    ubtc.textContent = u.toFixed(4);
    sat.textContent  = s.toFixed(6);
  } catch (e) {
    console.error('Error fetching Bitcoin price:', e);
  }
}

function start() {
  if (timer) return;
  updateTicker();
  timer = setInterval(updateTicker, 250);
}

// Start when elements exist (supports dynamic injection)
(function wait() {
  const { btc, mbtc, ubtc, sat } = getEls();
  if (btc && mbtc && ubtc && sat) start();
  else setTimeout(wait, 50);
})();

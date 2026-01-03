const API_URL = 'https://api.coinbase.com/v2/prices/spot?currency=USD';

let btcValue, mbtcValue, ubtcValue, satsValue;
let tickerTimer = null;

function bindTickerElements() {
  btcValue  = document.getElementById('btc-value');
  mbtcValue = document.getElementById('mbtc-value');
  ubtcValue = document.getElementById('ubtc-value');
  satsValue = document.getElementById('sats-value');

  return btcValue && mbtcValue && ubtcValue && satsValue;
}

async function updateTicker() {
  if (!bindTickerElements()) return;

  try {
    const response = await fetch(API_URL);
    const data = await response.json();
    const btcPrice = parseFloat(data.data.amount);

    // Subunit calculations
    const mbtc = btcPrice * 0.001;
    const ubtc = btcPrice * 0.000001;
    const sat  = btcPrice * 0.00000001;

    // Update DOM
    btcValue.textContent  = btcPrice.toFixed(2);
    mbtcValue.textContent = mbtc.toFixed(2);
    ubtcValue.textContent = ubtc.toFixed(4);
    satsValue.textContent = sat.toFixed(6);
  } catch (err) {
    console.error('Bitcoin ticker update failed:', err);
  }
}

function startTicker() {
  if (tickerTimer) return; // prevent double intervals

  updateTicker();
  tickerTimer = setInterval(updateTicker, 250);
}

/*
  IMPORTANT:
  The ticker HTML is injected dynamically.
  We must wait until it exists.
*/
(function waitForTicker() {
  if (bindTickerElements()) {
    startTicker();
  } else {
    setTimeout(waitForTicker, 50);
  }
})();

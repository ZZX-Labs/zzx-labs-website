const API_URL = 'https://api.coinbase.com/v2/prices/spot?currency=USD';

async function updateTicker() {
  const btcValue  = document.getElementById('btc-value');
  const mbtcValue = document.getElementById('mbtc-value');
  const ubtcValue = document.getElementById('ubtc-value');
  const satsValue = document.getElementById('sats-value');

  // Fragment not mounted yet (or removed) → do nothing
  if (!btcValue || !mbtcValue || !ubtcValue || !satsValue) return;

  try {
    const response = await fetch(API_URL);
    const data = await response.json();
    const btcPrice = parseFloat(data.data.amount);

    const mbtc = btcPrice * 0.001;
    const ubtc = btcPrice * 0.000001;
    const sat  = btcPrice * 0.00000001;

    btcValue.textContent  = btcPrice.toFixed(2);
    mbtcValue.textContent = mbtc.toFixed(2);
    ubtcValue.textContent = ubtc.toFixed(4);
    satsValue.textContent = sat.toFixed(6);
  } catch (error) {
    console.error('Error fetching Bitcoin price:', error);
  }
}

// run forever, safe even if fragment appears later
setInterval(updateTicker, 250);
updateTicker();

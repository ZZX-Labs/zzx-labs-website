const API_URL = 'https://api.coinbase.com/v2/prices/spot?currency=USD';

// DOM Elements
const btcValue = document.getElementById('btc-value');
const mbtcValue = document.getElementById('mbtc-value');
const ubtcValue = document.getElementById('ubtc-value');
const satsValue = document.getElementById('sats-value');

// Fetch Bitcoin prices and update DOM
async function updateTicker() {
  try {
    const response = await fetch(API_URL);
    const data = await response.json();
    const btcPrice = parseFloat(data.data.amount);

    // Calculate subunits
    const mbtc = btcPrice * 0.001; // 1 BTC = 1000 mBTC
    const ubtc = btcPrice * 0.00001; // 1 BTC = 1,000,000 μBTC
    const sats = btcPrice * 0.00000001; // 1 BTC = 100,000,000 sats

    // Update values
    btcValue.textContent = btcPrice.toFixed(2);
    mbtcValue.textContent = mbtc.toFixed(2);
    ubtcValue.textContent = ubtc.toFixed(4);
    satsValue.textContent = sats.toFixed(6);
  } catch (error) {
    console.error('Error fetching Bitcoin price:', error);
  }
}

// Update ticker every 1/4 second
setInterval(updateTicker, 250);

// Initial update
updateTicker();

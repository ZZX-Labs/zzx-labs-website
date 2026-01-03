// __partials/bitcoin-ticker-widget.js
<script>
  // Load ticker HTML into the btc-ticker mount (NOT the container)
  fetch('/bitcoin/ticker/ticker.html')
    .then(r => r.text())
    .then(html => {
      const mount = document.getElementById('btc-ticker');
      if (!mount) throw new Error('#btc-ticker mount not found');

      mount.innerHTML = html;

      // Load ticker.js once
      if (!document.querySelector('script[data-ticker-js="1"]')) {
        const s = document.createElement('script');
        s.src = '/bitcoin/ticker/ticker.js';
        s.defer = true;
        s.dataset.tickerJs = "1";
        document.body.appendChild(s);
      }
    })
    .catch(err => console.error('Error loading ticker widget:', err));
</script>

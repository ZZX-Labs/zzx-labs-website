<script>
    // Dynamically load the ticker HTML into the container
    fetch('../bitcoin/ticker/ticker.html')
      .then(response => response.text())
      .then(html => {
        document.getElementById('ticker-container').innerHTML = html;
        // Dynamically load and execute the ticker.js script
        const script = document.createElement('script');
        script.src = '../bitcoin/ticker/ticker.js';
        document.body.appendChild(script);
      })
      .catch(error => console.error('Error loading ticker widget:', error));
</script>

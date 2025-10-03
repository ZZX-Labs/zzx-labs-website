// /projects/software/parallel-explorer/script.js
// Local bootstrap for Parallel Explorer project page

(function () {
  const mountLinks = () => {
    const manifestBtn = document.querySelector('a[href$="manifest.json"]');
    if (manifestBtn) {
      manifestBtn.addEventListener('click', (e) => {
        console.log('Manifest.json requested for Parallel Explorer project');
      });
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    console.log('Parallel Explorer page initialized');
    mountLinks();
  });
})();

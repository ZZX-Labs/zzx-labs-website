(function(){
  // load core runtime once
  if (document.querySelector('script[data-zzx-runtime="1"]')) return;
  const s = document.createElement("script");
  s.src = (window.ZZX?.PREFIX ? window.ZZX.PREFIX.replace(/\/+$/,'') : ".") + "/__partials/widgets/runtime.js";
  s.defer = true;
  s.setAttribute("data-zzx-runtime", "1");
  document.body.appendChild(s);
})();

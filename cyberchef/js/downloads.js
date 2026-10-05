(() => {
    "use strict";
    const M=window.ZZXCyberChefModules, config=window.ZZX.CYBERCHEF;
    let official=config.officialDownloadUrl;
    function normalize(url){try{const u=new URL(url);return u.hostname==="github.com"&&u.pathname.startsWith("/gchq/CyberChef/")?u.href:null;}catch(_){return null;}}
    function updateOuter(){document.querySelectorAll("[data-cz-official-download]").forEach(a=>{a.href=official;a.removeAttribute("download");});}
    function patchModifiedFrame(){if(M.Runtime?.mode()!=="modified")return;const doc=M.Runtime?.document();if(!doc)return;doc.querySelectorAll("#download-modal a[download], #download-modal a[href$='.zip']").forEach(a=>{a.href=official;a.removeAttribute("download");a.target="_blank";a.rel="noopener";a.dataset.zzxOfficialDownload="1";});}
    M.Downloads={setManifest(manifest){const candidate=normalize(manifest?.release?.asset_url)||normalize(manifest?.release?.page_url);if(candidate)official=candidate;config.officialDownloadUrl=official;updateOuter();patchModifiedFrame();},boot(){updateOuter();window.addEventListener("zzx-cyberchef-frame-ready",patchModifiedFrame);window.addEventListener("zzx-cyberchef-manifest-ready",e=>this.setManifest(e.detail?.manifest));}};
})();

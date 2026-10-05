(() => {
    "use strict";
    const M=window.ZZXCyberChefModules, config=window.ZZX.CYBERCHEF;
    let official=config.officialDownloadUrl;
    function normalize(url){try{const u=new URL(url);return u.hostname==="github.com"&&u.pathname.startsWith("/gchq/CyberChef/")?u.href:null;}catch(_){return null;}}
    function updateOuter(){document.querySelectorAll("[data-cz-official-download]").forEach(a=>{a.href=official;a.removeAttribute("download");});}
    function patchModifiedFrame(){if(M.Runtime?.mode()!=="modified")return;const doc=M.Runtime?.document();if(!doc)return;doc.querySelectorAll("#download-modal a[download], #download-modal a[href$='.zip']").forEach(a=>{a.href=official;a.removeAttribute("download");a.target="_blank";a.rel="noopener";a.dataset.zzxOfficialDownload="1";});}
    async function openNativeSafely(event){
        const link=event.currentTarget; if(!link)return;
        event.preventDefault();
        const target=window.open("about:blank","_blank","noopener");
        try{
            const result=await M.Quota?.ensureWritable?.();
            if(result?.repaired) M.Status?.set("CyberChef browser storage repaired before opening the pristine native runtime.","ready");
        }catch(_){/* native remains pristine; this is best-effort preflight */}
        const href=new URL(link.getAttribute("href")||"./app/",window.location.href).href;
        if(target) target.location.replace(href); else window.location.assign(href);
    }
    M.Downloads={
        setManifest(manifest){const candidate=normalize(manifest?.release?.asset_url)||normalize(manifest?.release?.page_url);if(candidate)official=candidate;config.officialDownloadUrl=official;updateOuter();patchModifiedFrame();},
        boot(){
            updateOuter();
            document.querySelectorAll("[data-cz-open-native]").forEach(link=>link.addEventListener("click",openNativeSafely));
            window.addEventListener("zzx-cyberchef-frame-ready",patchModifiedFrame);
            window.addEventListener("zzx-cyberchef-manifest-ready",e=>this.setManifest(e.detail?.manifest));
        }
    };
})();

(function () {
    window.ZZX = window.ZZX || {};

    window.ZZX.CYBERCHEF = {
        version: "v11.0.0",
        local_url: "/cyberchef/app/",
        upstream_url: "https://gchq.github.io/CyberChef/",
        source: "local"
    };

    document.addEventListener("DOMContentLoaded", function () {
        const saved =
            localStorage.getItem("zzxCyberChefSource") ||
            "local";

        window.ZZX.CYBERCHEF.source = saved;

        document.dispatchEvent(
            new CustomEvent(
                "zzx-cyberchef-ready",
                {
                    detail: window.ZZX.CYBERCHEF
                }
            )
        );
    });
})();
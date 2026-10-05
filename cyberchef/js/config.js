(() => {
    "use strict";
    window.ZZX = window.ZZX || {};
    const previous = window.ZZX.CYBERCHEF || {};

    const themeFamilies = [
        { id: "tactical", label: "Tactical Olive", bg: "#161914", panel: "#22261f", accent: "#c0d674", secondary: "#e6a42b", text: "#d9ddd2", muted: "#939b8b", border: "#414a39", light: false },
        { id: "amber", label: "Amber Operations", bg: "#130e06", panel: "#241807", accent: "#e6a42b", secondary: "#c0d674", text: "#f0dfbf", muted: "#ae9671", border: "#57401f", light: false },
        { id: "terminal", label: "Terminal Green", bg: "#041007", panel: "#091a0e", accent: "#78ff66", secondary: "#b7ff66", text: "#d8ffd0", muted: "#80ad78", border: "#28522d", light: false },
        { id: "midnight", label: "Midnight Blue", bg: "#07101f", panel: "#101d32", accent: "#70b7ff", secondary: "#b889ff", text: "#d8ecff", muted: "#8fa6c0", border: "#324a68", light: false },
        { id: "crimson", label: "Crimson DFIR", bg: "#17090b", panel: "#261014", accent: "#ff7373", secondary: "#e6a42b", text: "#f5dddd", muted: "#b38d90", border: "#64363b", light: false },
        { id: "violet", label: "Violet Intel", bg: "#110b18", panel: "#1e142a", accent: "#b889ff", secondary: "#c0d674", text: "#eee4ff", muted: "#a696b9", border: "#4f3d66", light: false },
        { id: "arctic", label: "Arctic Mono", bg: "#10161a", panel: "#1a2329", accent: "#c7d8e3", secondary: "#7ac7ff", text: "#e8f0f5", muted: "#9aaab4", border: "#45545e", light: false },
        { id: "paper", label: "Paper", bg: "#ecebe3", panel: "#f5f3eb", accent: "#536326", secondary: "#98651d", text: "#292921", muted: "#6f6c60", border: "#b6b2a3", light: true }
    ];
    const themeVariants = [
        { id: "standard", label: "Standard", shade: 0, contrast: 0 },
        { id: "deep", label: "Deep", shade: -0.16, contrast: 0.04 },
        { id: "contrast", label: "High Contrast", shade: -0.06, contrast: 0.16 },
        { id: "lowlight", label: "Low Light", shade: -0.25, contrast: -0.05 },
        { id: "phosphor", label: "Phosphor", shade: -0.12, contrast: 0.10 },
        { id: "slate", label: "Slate", shade: 0.08, contrast: -0.02 },
        { id: "warm", label: "Warm", shade: 0.03, contrast: 0.05 },
        { id: "cold", label: "Cold", shade: -0.02, contrast: 0.08 }
    ];
    const themePresets = themeFamilies.flatMap((family, familyIndex) => themeVariants.map((variant, variantIndex) => ({
        id: `${family.id}-${variant.id}`,
        label: `${family.label} / ${variant.label}`,
        family, variant, familyIndex, variantIndex
    })));

    const layoutBases = [
        ["native", "Native", null],
        ["balanced", "Balanced", [25, 28, 47, 50, 50]],
        ["ops-wide", "Operations Wide", [38, 22, 40, 50, 50]],
        ["recipe-wide", "Recipe Wide", [20, 42, 38, 50, 50]],
        ["io-wide", "I/O Wide", [18, 24, 58, 50, 50]],
        ["ops-max", "Operations Maximum", [48, 18, 34, 50, 50]],
        ["recipe-max", "Recipe Maximum", [16, 52, 32, 50, 50]],
        ["io-max", "I/O Maximum", [14, 18, 68, 50, 50]],
        ["input-focus", "Input Focus", [18, 24, 58, 72, 28]],
        ["output-focus", "Output Focus", [18, 24, 58, 28, 72]],
        ["ops-io", "Operations + I/O", [32, 18, 50, 50, 50]],
        ["recipe-io", "Recipe + I/O", [16, 34, 50, 50, 50]],
        ["tri-even", "Three-Way Even", [33, 34, 33, 50, 50]],
        ["analysis", "Analysis Bench", [28, 30, 42, 42, 58]],
        ["decode", "Decode Bench", [22, 28, 50, 58, 42]],
        ["forensics", "Forensics Bench", [30, 24, 46, 64, 36]]
    ];
    const layoutDensities = [
        ["standard", "Standard", 1.00, 6, 44],
        ["dense", "Dense", 0.92, 3, 36],
        ["compact", "Compact", 0.86, 2, 32],
        ["micro", "Micro", 0.80, 1, 28],
        ["spacious", "Spacious", 1.08, 8, 50],
        ["large", "Large Type", 1.16, 7, 52],
        ["tall", "Tall Controls", 1.02, 10, 58],
        ["cinema", "Cinema", 0.96, 5, 40]
    ];
    const layoutPresets = layoutBases.flatMap((base, baseIndex) => layoutDensities.map((density, densityIndex) => ({
        id: `${base[0]}-${density[0]}`,
        label: `${base[1]} / ${density[1]}`,
        baseId: base[0], baseLabel: base[1], geometry: base[2],
        densityId: density[0], densityLabel: density[1], scale: density[2], operationPadding: density[3], bannerHeight: density[4],
        baseIndex, densityIndex,
        native: base[0] === "native" && density[0] === "standard"
    })));

    const macroDefaults = {
        a: [
            ["Magic Inspect", ["Magic"]], ["From Base64", ["From Base64"]], ["From Hex", ["From Hex"]], ["URL Decode", ["URL Decode"]],
            ["Extract URLs", ["Extract URLs"]], ["Extract IPs", ["Extract IP addresses"]], ["Strings", ["Strings"]], ["Entropy", ["Entropy"]],
            ["Gunzip", ["Gunzip"]], ["Unzip", ["Unzip"]], ["From Base64 → Gunzip", ["From Base64", "Gunzip"]], ["From Hex → Strings", ["From Hex", "Strings"]],
            ["Magic → Strings", ["Magic", "Strings"]], ["URL Decode → Magic", ["URL Decode", "Magic"]], ["Base64 → Magic", ["From Base64", "Magic"]], ["User Slot A16", []]
        ],
        b: [
            ["Base64 Decode", ["From Base64"]], ["Base64 Encode", ["To Base64"]], ["Hex Decode", ["From Hex"]], ["Hex Encode", ["To Hex"]],
            ["URL Decode", ["URL Decode"]], ["URL Encode", ["URL Encode"]], ["HTML Decode", ["From HTML Entity"]], ["HTML Encode", ["To HTML Entity"]],
            ["Binary Decode", ["From Binary"]], ["Binary Encode", ["To Binary"]], ["Charcode Decode", ["From Charcode"]], ["Charcode Encode", ["To Charcode"]],
            ["JWT Decode", ["JWT Decode"]], ["Quoted Printable Decode", ["From Quoted Printable"]], ["Punycode Decode", ["From Punycode"]], ["User Slot B16", []]
        ],
        c: [
            ["SHA2-256", ["SHA2"]], ["SHA2-512", ["SHA2"]], ["MD5", ["MD5"]], ["RIPEMD", ["RIPEMD"]],
            ["SHA1", ["SHA1"]], ["CRC32", ["CRC-32 Checksum"]], ["HMAC", ["HMAC"]], ["Fletcher", ["Fletcher-32 Checksum"]],
            ["Analyse Hash", ["Analyse hash"]], ["Generate UUID", ["Generate UUID"]], ["Random Bytes", ["Generate random bytes"]], ["Entropy", ["Entropy"]],
            ["To Hex → SHA2", ["To Hex", "SHA2"]], ["Base64 → SHA2", ["From Base64", "SHA2"]], ["Hex → SHA2", ["From Hex", "SHA2"]], ["User Slot C16", []]
        ],
        d: [
            ["Extract URLs", ["Extract URLs"]], ["Extract IPs", ["Extract IP addresses"]], ["Extract Domains", ["Extract domains"]], ["Extract Emails", ["Extract email addresses"]],
            ["Strings", ["Strings"]], ["Detect File Type", ["Detect File Type"]], ["Parse URI", ["Parse URI"]], ["Parse User Agent", ["Parse User Agent"]],
            ["Defang URL", ["Defang URL"]], ["Defang IP", ["Defang IP Addresses"]], ["Scan for Embedded Files", ["Scan for embedded files"]], ["Disassemble x86", ["Disassemble x86"]],
            ["Magic", ["Magic"]], ["Strings → Extract URLs", ["Strings", "Extract URLs"]], ["Magic → Extract URLs", ["Magic", "Extract URLs"]], ["User Slot D16", []]
        ]
    };

    window.ZZX.CYBERCHEF = Object.assign(previous, {
        title: "CyberChefZZX",
        defaultSource: "modified",
        nativeUrl: "./app/index.html",
        manifestUrl: "./runtime-manifest.json",
        shimUrl: "./css/frame/shim.css",
        officialRepoUrl: "https://github.com/gchq/CyberChef",
        officialLiveUrl: "https://gchq.github.io/CyberChef/",
        officialReleasesUrl: "https://github.com/gchq/CyberChef/releases",
        officialLatestReleaseUrl: "https://github.com/gchq/CyberChef/releases/latest",
        officialDownloadUrl: "https://github.com/gchq/CyberChef/releases/latest",
        frameId: "cz-frame", sourceId: "cz-source", loadButtonId: "cz-load", refreshButtonId: "cz-refresh",
        statusId: "cz-status", activeSourceId: "cz-active-source", frameStateId: "cz-frame-state", modificationsId: "cz-modifications",
        themeFamilies, themeVariants, themePresets,
        layoutBases, layoutDensities, layoutPresets,
        macroDefaults,
        macroBanks: ["a", "b", "c", "d"], macroSlotsPerBank: 16,
        storageKeys: {
            source: "zzxCyberChefSourceV13", theme: "zzxCyberChefThemeV13", layout: "zzxCyberChefLayoutV13",
            module: "zzxCyberChefModuleV13", function: "zzxCyberChefFunctionV13", macros: "zzxCyberChefMacrosV13",
            macroIndices: "zzxCyberChefMacroIndicesV13", viewMode: "zzxCyberChefViewModeV13"
        }
    });
    window.ZZXCyberChefModules = window.ZZXCyberChefModules || {};
})();

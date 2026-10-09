(() => {
    "use strict";
    window.ZZX = window.ZZX || {};
    const previous = window.ZZX.CYBERCHEF || {};

    const macroDefaults = {
        a: [
            {kind:"macro",name:"Magic Inspect",operations:["Magic"]},
            {kind:"macro",name:"Base64 → Magic",operations:["From Base64","Magic"]},
            {kind:"macro",name:"Hex → Strings",operations:["From Hex","Strings"]},
            {kind:"macro",name:"URL Decode → Magic",operations:["URL Decode","Magic"]},
            {kind:"macro",name:"Extract URLs",operations:["Extract URLs"]},
            {kind:"macro",name:"Extract IPs",operations:["Extract IP addresses"]},
            {kind:"macro",name:"Strings",operations:["Strings"]},
            {kind:"macro",name:"Entropy",operations:["Entropy"]},
            {kind:"macro",name:"Gunzip",operations:["Gunzip"]},
            {kind:"macro",name:"Unzip",operations:["Unzip"]},
            {kind:"macro",name:"Base64 → Gunzip",operations:["From Base64","Gunzip"]},
            {kind:"macro",name:"Magic → Strings",operations:["Magic","Strings"]},
            {kind:"recipe",name:"Recipe Slot A13",recipe:""},
            {kind:"recipe",name:"Recipe Slot A14",recipe:""},
            {kind:"macro",name:"User Macro A15",operations:[]},
            {kind:"recipe",name:"User Recipe A16",recipe:""}
        ],
        b: [
            {kind:"macro",name:"Base64 Decode",operations:["From Base64"]},
            {kind:"macro",name:"Base64 Encode",operations:["To Base64"]},
            {kind:"macro",name:"Hex Decode",operations:["From Hex"]},
            {kind:"macro",name:"Hex Encode",operations:["To Hex"]},
            {kind:"macro",name:"URL Decode",operations:["URL Decode"]},
            {kind:"macro",name:"URL Encode",operations:["URL Encode"]},
            {kind:"macro",name:"HTML Decode",operations:["From HTML Entity"]},
            {kind:"macro",name:"HTML Encode",operations:["To HTML Entity"]},
            {kind:"macro",name:"Binary Decode",operations:["From Binary"]},
            {kind:"macro",name:"Binary Encode",operations:["To Binary"]},
            {kind:"macro",name:"Charcode Decode",operations:["From Charcode"]},
            {kind:"macro",name:"Charcode Encode",operations:["To Charcode"]},
            {kind:"recipe",name:"Recipe Slot B13",recipe:""},
            {kind:"recipe",name:"Recipe Slot B14",recipe:""},
            {kind:"macro",name:"User Macro B15",operations:[]},
            {kind:"recipe",name:"User Recipe B16",recipe:""}
        ],
        c: [
            {kind:"macro",name:"SHA2",operations:["SHA2"]},
            {kind:"macro",name:"SHA3",operations:["SHA3"]},
            {kind:"macro",name:"MD5",operations:["MD5"]},
            {kind:"macro",name:"RIPEMD",operations:["RIPEMD"]},
            {kind:"macro",name:"SHA1",operations:["SHA1"]},
            {kind:"macro",name:"CRC-32",operations:["CRC-32 Checksum"]},
            {kind:"macro",name:"HMAC",operations:["HMAC"]},
            {kind:"macro",name:"Analyse Hash",operations:["Analyse hash"]},
            {kind:"macro",name:"Random Bytes",operations:["Generate random bytes"]},
            {kind:"macro",name:"Entropy",operations:["Entropy"]},
            {kind:"macro",name:"Hex → SHA2",operations:["From Hex","SHA2"]},
            {kind:"macro",name:"Base64 → SHA2",operations:["From Base64","SHA2"]},
            {kind:"recipe",name:"Recipe Slot C13",recipe:""},
            {kind:"recipe",name:"Recipe Slot C14",recipe:""},
            {kind:"macro",name:"User Macro C15",operations:[]},
            {kind:"recipe",name:"User Recipe C16",recipe:""}
        ],
        d: [
            {kind:"macro",name:"Extract URLs",operations:["Extract URLs"]},
            {kind:"macro",name:"Extract IPs",operations:["Extract IP addresses"]},
            {kind:"macro",name:"Extract Domains",operations:["Extract domains"]},
            {kind:"macro",name:"Extract Emails",operations:["Extract email addresses"]},
            {kind:"macro",name:"Strings",operations:["Strings"]},
            {kind:"macro",name:"Detect File Type",operations:["Detect File Type"]},
            {kind:"macro",name:"Parse URI",operations:["Parse URI"]},
            {kind:"macro",name:"Parse User Agent",operations:["Parse User Agent"]},
            {kind:"macro",name:"Defang URL",operations:["Defang URL"]},
            {kind:"macro",name:"Defang IP",operations:["Defang IP Addresses"]},
            {kind:"macro",name:"Scan Embedded",operations:["Scan for embedded files"]},
            {kind:"macro",name:"Magic → URLs",operations:["Magic","Extract URLs"]},
            {kind:"recipe",name:"Recipe Slot D13",recipe:""},
            {kind:"recipe",name:"Recipe Slot D14",recipe:""},
            {kind:"macro",name:"User Macro D15",operations:[]},
            {kind:"recipe",name:"User Recipe D16",recipe:""}
        ]
    };

    window.ZZX.CYBERCHEF = Object.assign(previous, {
        title: "CyberChefZZX",
        defaultSource: "modified",
        nativeUrl: "./app/index.html",
        manifestUrl: "./runtime-manifest.json",
        shimUrl: "./css/frame/shim.css",
        themeIndexUrl: "./themes/index.json",
        layoutIndexUrl: "./layouts/index.json",
        officialRepoUrl: "https://github.com/gchq/CyberChef",
        officialLiveUrl: "https://gchq.github.io/CyberChef/",
        officialReleasesUrl: "https://github.com/gchq/CyberChef/releases",
        officialLatestReleaseUrl: "https://github.com/gchq/CyberChef/releases/latest",
        officialDownloadUrl: "https://github.com/gchq/CyberChef/releases/latest",
        runtimeId: "cz-runtime", frameId: "cz-frame", sourceId: "cz-source", loadButtonId: "cz-load", refreshButtonId: "cz-refresh",
        statusId: "cz-status", activeSourceId: "cz-active-source", frameStateId: "cz-frame-state", modificationsId: "cz-modifications",
        macroDefaults,
        macroBanks: ["a", "b", "c", "d"], macroSlotsPerBank: 16,
        storageKeys: {
            source: "zzxCyberChefSourceV16", theme: "zzxCyberChefThemeV16", layout: "zzxCyberChefLayoutV16",
            module: "zzxCyberChefModuleV16", function: "zzxCyberChefFunctionV16", macros: "zzxCyberChefMacrosV16",
            macroIndices: "zzxCyberChefMacroIndicesV16", viewMode: "zzxCyberChefViewModeV16"
        }
    });
    window.ZZXCyberChefModules = window.ZZXCyberChefModules || {};
})();

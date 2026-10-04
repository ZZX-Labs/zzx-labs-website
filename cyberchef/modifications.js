(() => {
    "use strict";

    const config = window.ZZX?.CYBERCHEF || {};
    const drawerKey = config.storageKeys?.drawer || "zzxCyberChefDrawer";

    const RECIPES = {
        Bitcoin: [
            ["SHA256", "SHA2('256',64,160)"],
            ["Double SHA256", "SHA2('256',64,160)SHA2('256',64,160)"],
            ["RIPEMD160", "RIPEMD-160()"],
            ["Hash160", "SHA2('256',64,160)RIPEMD-160()"],
            ["Base58 Decode", "From_Base58('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz',true)"],
            ["Base58 Encode", "To_Base58('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz')"],
            ["Reverse Endian", "Swap_endianness('Hex',4,true)"],
            ["Hex → Decimal", "From_Hex('Auto')To_Decimal('Space',false)"]
        ],
        OSINT: [
            ["URL Decode", "URL_Decode()"],
            ["URL Encode", "URL_Encode(true)"],
            ["Defang URL", "Defang_URL(true,true,true,'Valid domains and full URLs')"],
            ["Extract URLs", "Extract_URLs(false)"],
            ["Extract IPs", "Extract_IP_addresses()"],
            ["Extract Domains", "Extract_domains(true)"],
            ["Extract Emails", "Extract_email_addresses()"],
            ["Parse User Agent", "Parse_User_Agent()"]
        ],
        Malware: [
            ["From Hex", "From_Hex('Auto')"],
            ["Strings", "Strings('Single byte',4,'Alphanumeric + punctuation (A)',false)"],
            ["Extract Domains", "Extract_domains(true)"],
            ["Extract Hashes", "Extract_hashes()"],
            ["XOR Brute Force", "XOR_Brute_Force(1,100,0,'Standard',false,true,false,'')"],
            ["Entropy", "Entropy('Shannon scale')"]
        ],
        DFIR: [
            ["UNIX Timestamp", "From_UNIX_Timestamp('Seconds (s)')"],
            ["Windows FILETIME", "From_FILETIME()"],
            ["Gunzip", "Gunzip()"],
            ["From Base64", "From_Base64('A-Za-z0-9+/=',true,false)"],
            ["To Base64", "To_Base64('A-Za-z0-9+/=')"],
            ["From Hexdump", "From_Hexdump()"],
            ["JSON Beautify", "JSON_Beautify('    ',false)"]
        ],
        Crypto: [
            ["MD5", "MD5()"],
            ["SHA1", "SHA1()"],
            ["SHA256", "SHA2('256',64,160)"],
            ["SHA512", "SHA2('512',64,160)"],
            ["HMAC SHA256", "HMAC(%7B'option':'UTF8','string':''%7D,'SHA256')"]
        ]
    };

    function ready(fn) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", fn, { once: true });
        } else {
            fn();
        }
    }

    function encodeRecipe(recipe) {
        return encodeURIComponent(recipe);
    }

    function loadRecipe(recipe) {
        const next = `#recipe=${encodeRecipe(recipe)}`;
        if (window.location.hash === next) {
            window.location.reload();
            return;
        }
        window.location.hash = next;
        window.location.reload();
    }

    function openNative(recipe) {
        window.open(`./app/#recipe=${encodeRecipe(recipe)}`, "_blank", "noopener");
    }

    function setOpen(drawer, open) {
        drawer.hidden = !open;
        document.documentElement.classList.toggle("zzx-drawer-open", open);
        const toggle = document.getElementById("zzx-recipes-toggle");
        toggle?.setAttribute("aria-expanded", open ? "true" : "false");
        try {
            localStorage.setItem(drawerKey, open ? "1" : "0");
        } catch (_) {}
    }

    function getStoredOpen() {
        try {
            return localStorage.getItem(drawerKey) === "1";
        } catch (_) {
            return false;
        }
    }

    function makeRecipeGroup(title, items) {
        const section = document.createElement("section");
        section.className = "zzx-recipe-group";
        const heading = document.createElement("h3");
        heading.textContent = title;
        section.appendChild(heading);

        const grid = document.createElement("div");
        grid.className = "zzx-recipe-buttons";
        for (const [name, recipe] of items) {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = name;
            button.title = recipe;
            button.addEventListener("click", () => loadRecipe(recipe));
            grid.appendChild(button);
        }
        section.appendChild(grid);
        return section;
    }

    function buildDrawer() {
        if (document.getElementById("zzx-cyberchef-drawer")) {
            return;
        }

        const drawer = document.createElement("aside");
        drawer.id = "zzx-cyberchef-drawer";
        drawer.hidden = true;
        drawer.setAttribute("aria-label", "ZZX CyberChef recipes");
        drawer.innerHTML = `
            <header class="zzx-drawer-head">
                <div>
                    <strong>ZZX Recipes</strong>
                    <span>CyberChef remains the runtime; these are recipe launchers.</span>
                </div>
                <button id="zzx-drawer-close" type="button" aria-label="Close ZZX recipes">×</button>
            </header>
            <div id="zzx-recipe-groups"></div>
            <section class="zzx-recipe-group">
                <h3>Scratch Recipe</h3>
                <textarea id="zzx-recipe-scratch" spellcheck="false" placeholder="Paste a CyberChef recipe string..."></textarea>
                <div class="zzx-scratch-actions">
                    <button id="zzx-scratch-load" type="button">Load Here</button>
                    <button id="zzx-scratch-native" type="button">Open Native</button>
                </div>
            </section>
        `;

        const groups = drawer.querySelector("#zzx-recipe-groups");
        for (const [title, items] of Object.entries(RECIPES)) {
            groups.appendChild(makeRecipeGroup(title, items));
        }

        drawer.querySelector("#zzx-drawer-close").addEventListener("click", () => setOpen(drawer, false));
        drawer.querySelector("#zzx-scratch-load").addEventListener("click", () => {
            const recipe = drawer.querySelector("#zzx-recipe-scratch").value.trim();
            if (recipe) loadRecipe(recipe);
        });
        drawer.querySelector("#zzx-scratch-native").addEventListener("click", () => {
            const recipe = drawer.querySelector("#zzx-recipe-scratch").value.trim();
            if (recipe) openNative(recipe);
        });

        window.addEventListener("zzx-cyberchef-toggle-drawer", () => {
            setOpen(drawer, drawer.hidden);
        });
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && !drawer.hidden) {
                setOpen(drawer, false);
            }
        });

        document.body.appendChild(drawer);
        setOpen(drawer, getStoredOpen());
    }

    ready(buildDrawer);
})();

(() => {
    "use strict";

    const RECIPES = {
        bitcoin: [
            {
                name: "SHA256",
                recipe: "SHA2('256',64,160)"
            },
            {
                name: "Double SHA256",
                recipe: "SHA2('256',64,160)SHA2('256',64,160)"
            },
            {
                name: "Base58 Decode",
                recipe: "From_Base58('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz',true)"
            },
            {
                name: "Base58 Encode",
                recipe: "To_Base58('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz')"
            },
            {
                name: "Reverse Endian",
                recipe: "Swap_endianness('Hex',4,true)"
            }
        ],

        osint: [
            {
                name: "URL Decode",
                recipe: "URL_Decode()"
            },
            {
                name: "Defang URL",
                recipe: "Defang_URL(true,true,true,'Valid domains and full URLs')"
            },
            {
                name: "Extract URLs",
                recipe: "Extract_URLs(false)"
            },
            {
                name: "Extract IPs",
                recipe: "Extract_IP_addresses()"
            },
            {
                name: "Extract Email Addresses",
                recipe: "Extract_email_addresses()"
            }
        ],

        malware: [
            {
                name: "From Hex",
                recipe: "From_Hex('Auto')"
            },
            {
                name: "Strings",
                recipe: "Strings('Single byte',4,'Alphanumeric + punctuation (A)',false)"
            },
            {
                name: "Extract Domains",
                recipe: "Extract_domains(true)"
            },
            {
                name: "Extract Hashes",
                recipe: "Extract_hashes()"
            },
            {
                name: "XOR Brute Force",
                recipe: "XOR_Brute_Force(1,100,0,'Standard',false,true,false,'')"
            }
        ],

        dfir: [
            {
                name: "Parse UNIX Timestamp",
                recipe: "From_UNIX_Timestamp('Seconds (s)')"
            },
            {
                name: "Parse Windows FILETIME",
                recipe: "From_FILETIME()"
            },
            {
                name: "Gunzip",
                recipe: "Gunzip()"
            },
            {
                name: "From Base64",
                recipe: "From_Base64('A-Za-z0-9+/=',true,false)"
            },
            {
                name: "Entropy",
                recipe: "Entropy('Shannon scale')"
            }
        ]
    };

    function ready(fn) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", fn);
        } else {
            fn();
        }
    }

    function getFrameWindow() {
        const frame = document.getElementById("cz-frame");
        return frame?.contentWindow || null;
    }

    function openRecipe(recipe) {
        const frame = document.getElementById("cz-frame");
        if (!frame) return;

        const base = "./app/";
        frame.src = `${base}#recipe=${encodeURIComponent(recipe)}`;
    }

    function copyText(text) {
        navigator.clipboard?.writeText(text).catch(() => {});
    }

    function makeRecipeCard(title, items) {
        const card = document.createElement("article");
        card.className = "cz-mod-card";

        const h = document.createElement("h3");
        h.textContent = title;
        card.appendChild(h);

        for (const item of items) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.textContent = item.name;
            btn.addEventListener("click", () => openRecipe(item.recipe));
            card.appendChild(btn);
        }

        return card;
    }

    function buildPanel() {
        const anchor = document.querySelector(".cz-credit-grid")?.closest(".cz-panel");
        if (!anchor) return;

        const panel = document.createElement("section");
        panel.className = "cz-mod-panel container";

        panel.innerHTML = `
            <h2>ZZX CyberChef Modifications</h2>
            <p class="cz-mod-note">
                ZZX recipe launchers, analyst helpers, Bitcoin transforms, OSINT extraction,
                malware triage, DFIR utilities, and wrapper-side controls. These do not modify
                upstream CyberChef source; they launch recipes and augment the container layer.
            </p>
            <div class="cz-mod-grid" id="cz-mod-grid"></div>
        `;

        anchor.parentNode.insertBefore(panel, anchor);

        const grid = panel.querySelector("#cz-mod-grid");

        grid.appendChild(makeRecipeCard("Bitcoin", RECIPES.bitcoin));
        grid.appendChild(makeRecipeCard("OSINT", RECIPES.osint));
        grid.appendChild(makeRecipeCard("Malware", RECIPES.malware));
        grid.appendChild(makeRecipeCard("DFIR", RECIPES.dfir));

        const scratch = document.createElement("article");
        scratch.className = "cz-mod-card";
        scratch.innerHTML = `
            <h3>Recipe Scratchpad</h3>
            <textarea id="cz-recipe-scratch" placeholder="Paste or write CyberChef recipe text here..."></textarea>
            <button id="cz-open-scratch" type="button">Open Scratch Recipe</button>
            <button id="cz-copy-scratch" type="button">Copy Scratch Recipe</button>
        `;
        grid.appendChild(scratch);

        document.getElementById("cz-open-scratch")?.addEventListener("click", () => {
            const text = document.getElementById("cz-recipe-scratch")?.value || "";
            if (text.trim()) openRecipe(text.trim());
        });

        document.getElementById("cz-copy-scratch")?.addEventListener("click", () => {
            const text = document.getElementById("cz-recipe-scratch")?.value || "";
            copyText(text);
        });
    }

    ready(() => {
        buildPanel();
        console.info("[CyberChefZZX] Modifications loaded.");
    });
})();
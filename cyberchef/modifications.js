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
                name: "RIPEMD160",
                recipe: "RIPEMD-160()"
            },
            {
                name: "Hash160",
                recipe: "SHA2('256',64,160)RIPEMD-160()"
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
            },
            {
                name: "Hex To Decimal",
                recipe: "From_Hex('Auto')To_Decimal('Space',false)"
            }
        ],

        osint: [
            {
                name: "URL Decode",
                recipe: "URL_Decode()"
            },
            {
                name: "URL Encode",
                recipe: "URL_Encode(true)"
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
                name: "Extract Domains",
                recipe: "Extract_domains(true)"
            },
            {
                name: "Extract Email Addresses",
                recipe: "Extract_email_addresses()"
            },
            {
                name: "Parse User Agent",
                recipe: "Parse_User_Agent()"
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
            },
            {
                name: "Entropy",
                recipe: "Entropy('Shannon scale')"
            },
            {
                name: "PEM To Hex",
                recipe: "Remove_whitespace(true,true,true,true,true,false)From_Base64('A-Za-z0-9+/=',true,false)To_Hex('Space',0)"
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
                name: "To Base64",
                recipe: "To_Base64('A-Za-z0-9+/=')"
            },
            {
                name: "From Hexdump",
                recipe: "From_Hexdump()"
            },
            {
                name: "JSON Beautify",
                recipe: "JSON_Beautify('    ',false)"
            }
        ],

        crypto: [
            {
                name: "MD5",
                recipe: "MD5()"
            },
            {
                name: "SHA1",
                recipe: "SHA1()"
            },
            {
                name: "SHA256",
                recipe: "SHA2('256',64,160)"
            },
            {
                name: "SHA512",
                recipe: "SHA2('512',64,160)"
            },
            {
                name: "HMAC SHA256",
                recipe: "HMAC(%7B'option':'UTF8','string':''%7D,'SHA256')"
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

    function encodeRecipe(recipe) {
        return encodeURIComponent(recipe);
    }

    function openRecipe(recipe) {
        const url = `#recipe=${encodeRecipe(recipe)}`;

        try {
            window.location.hash = url.slice(1);
        } catch (err) {}

        try {
            window.dispatchEvent(
                new HashChangeEvent("hashchange")
            );
        } catch (err) {}

        try {
            location.reload();
        } catch (err) {}
    }

    function openNativeRecipe(recipe) {
        window.open(
            `./app/#recipe=${encodeRecipe(recipe)}`,
            "_blank",
            "noopener"
        );
    }

    function copyText(text) {
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text).catch(() => {});
            return;
        }

        const area = document.createElement("textarea");
        area.value = text;
        document.body.appendChild(area);
        area.select();

        try {
            document.execCommand("copy");
        } catch (err) {}

        area.remove();
    }

    function makeRecipeButton(item) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = item.name;
        btn.title = item.recipe;

        btn.addEventListener("click", () => {
            openRecipe(item.recipe);
        });

        return btn;
    }

    function makeRecipeCard(title, items) {
        const card = document.createElement("article");
        card.className = "cz-mod-card";

        const h = document.createElement("h3");
        h.textContent = title;
        card.appendChild(h);

        const note = document.createElement("p");
        note.className = "cz-mini";
        note.textContent = "Click to load into CyberChefZZX. Use native launch for the untouched app.";
        card.appendChild(note);

        for (const item of items) {
            card.appendChild(makeRecipeButton(item));
        }

        const nativeBtn = document.createElement("button");
        nativeBtn.type = "button";
        nativeBtn.textContent = "Open First Recipe In Native App";
        nativeBtn.addEventListener("click", () => {
            if (items[0]) {
                openNativeRecipe(items[0].recipe);
            }
        });

        card.appendChild(nativeBtn);

        return card;
    }

    function makeScratchCard() {
        const scratch = document.createElement("article");
        scratch.className = "cz-mod-card";

        scratch.innerHTML = `
            <h3>Recipe Scratchpad</h3>

            <p class="cz-mini">
                Paste or write CyberChef recipe text, then load it into the
                modified instance, open it in native CyberChef, or copy it.
            </p>

            <textarea
                id="cz-recipe-scratch"
                placeholder="Paste or write CyberChef recipe text here..."
            ></textarea>

            <button id="cz-open-scratch" type="button">
                Open Scratch Recipe
            </button>

            <button id="cz-open-scratch-native" type="button">
                Open Scratch In Native App
            </button>

            <button id="cz-copy-scratch" type="button">
                Copy Scratch Recipe
            </button>
        `;

        return scratch;
    }

    function wireScratchCard() {
        const area = document.getElementById("cz-recipe-scratch");

        document.getElementById("cz-open-scratch")
            ?.addEventListener("click", () => {
                const text = area?.value || "";

                if (text.trim()) {
                    openRecipe(text.trim());
                }
            });

        document.getElementById("cz-open-scratch-native")
            ?.addEventListener("click", () => {
                const text = area?.value || "";

                if (text.trim()) {
                    openNativeRecipe(text.trim());
                }
            });

        document.getElementById("cz-copy-scratch")
            ?.addEventListener("click", () => {
                copyText(area?.value || "");
            });
    }

    function makeUtilitiesCard() {
        const card = document.createElement("article");
        card.className = "cz-mod-card";

        card.innerHTML = `
            <h3>Workspace Tools</h3>

            <p class="cz-mini">
                Fast controls for the CyberChefZZX modified workspace.
            </p>

            <button id="cz-copy-url" type="button">
                Copy Current URL
            </button>

            <button id="cz-clear-hash" type="button">
                Clear Recipe Hash
            </button>

            <button id="cz-open-native" type="button">
                Open Native CyberChef
            </button>
        `;

        return card;
    }

    function wireUtilitiesCard() {
        document.getElementById("cz-copy-url")
            ?.addEventListener("click", () => {
                copyText(window.location.href);
            });

        document.getElementById("cz-clear-hash")
            ?.addEventListener("click", () => {
                history.replaceState(
                    null,
                    document.title,
                    window.location.pathname
                );
            });

        document.getElementById("cz-open-native")
            ?.addEventListener("click", () => {
                window.open("./app/", "_blank", "noopener");
            });
    }

    function buildPanel() {
        const mount =
            document.getElementById("cz-modifications") ||
            document.querySelector("[data-cz-modifications]");

        if (!mount) {
            return;
        }

        mount.innerHTML = "";

        const panel = document.createElement("section");
        panel.className = "cz-mod-panel";

        panel.innerHTML = `
            <h2>ZZX CyberChef Modifications</h2>

            <p class="cz-mod-note">
                ZZX recipe launchers, analyst helpers, Bitcoin transforms, OSINT extraction,
                malware triage, DFIR utilities, cryptographic presets, and workspace controls.
                These augment the CyberChefZZX page without editing upstream CyberChef source.
            </p>

            <div class="cz-mod-grid" id="cz-mod-grid"></div>
        `;

        mount.appendChild(panel);

        const grid = panel.querySelector("#cz-mod-grid");

        grid.appendChild(makeRecipeCard("Bitcoin", RECIPES.bitcoin));
        grid.appendChild(makeRecipeCard("OSINT", RECIPES.osint));
        grid.appendChild(makeRecipeCard("Malware", RECIPES.malware));
        grid.appendChild(makeRecipeCard("DFIR", RECIPES.dfir));
        grid.appendChild(makeRecipeCard("Crypto", RECIPES.crypto));
        grid.appendChild(makeScratchCard());
        grid.appendChild(makeUtilitiesCard());

        wireScratchCard();
        wireUtilitiesCard();
    }

    ready(() => {
        buildPanel();

        window.addEventListener(
            "zzx-cyberchef-ready",
            () => {
                buildPanel();
            },
            { once: true }
        );

        console.info("[CyberChefZZX] Modifications loaded.");
    });
})();
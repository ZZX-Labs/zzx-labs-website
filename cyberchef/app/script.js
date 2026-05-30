(function () {
    "use strict";

    function memoryStorage() {
        var mem = {};

        return {
            getItem: function (k) {
                return Object.prototype.hasOwnProperty.call(mem, k)
                    ? mem[k]
                    : null;
            },

            setItem: function (k, v) {
                mem[k] = String(v);
            },

            removeItem: function (k) {
                delete mem[k];
            },

            clear: function () {
                mem = {};
            },

            key: function (i) {
                return Object.keys(mem)[i] || null;
            },

            get length() {
                return Object.keys(mem).length;
            }
        };
    }

    function storageWorks(name) {
        try {
            var s = window[name];
            var k = "__zzx_storage_test__";

            s.setItem(k, "1");
            s.removeItem(k);

            return true;
        } catch (e) {
            return false;
        }
    }

    function installStorageShim() {
        try {
            if (!storageWorks("localStorage")) {
                Object.defineProperty(window, "localStorage", {
                    configurable: true,
                    value: memoryStorage()
                });
            }
        } catch (e) {}

        try {
            if (!storageWorks("sessionStorage")) {
                Object.defineProperty(window, "sessionStorage", {
                    configurable: true,
                    value: memoryStorage()
                });
            }
        } catch (e) {}

        try {
            var originalSetItem = Storage.prototype.setItem;

            Storage.prototype.setItem = function (key, value) {
                try {
                    return originalSetItem.call(this, key, value);
                } catch (e) {
                    if (
                        e &&
                        (
                            e.name === "QuotaExceededError" ||
                            e.name === "NS_ERROR_DOM_QUOTA_REACHED"
                        )
                    ) {
                        return null;
                    }

                    throw e;
                }
            };
        } catch (e) {}
    }

    function forceDark() {
        try {
            localStorage.setItem(
                "options",
                JSON.stringify({
                    theme: "dark",
                    wordWrap: true,
                    showErrors: true,
                    updateUrl: true
                })
            );
        } catch (e) {}

        try {
            document.documentElement.classList.remove(
                "classic",
                "geocities",
                "solarizedDark",
                "solarizedLight"
            );

            document.documentElement.classList.add("dark");
        } catch (e) {}

        try {
            var select = document.querySelector("#theme");

            if (select && select.value !== "dark") {
                select.value = "dark";
                select.dispatchEvent(
                    new Event("change", {
                        bubbles: true
                    })
                );
            }
        } catch (e) {}
    }

    installStorageShim();
    forceDark();

    document.addEventListener("DOMContentLoaded", function () {
        forceDark();
        setTimeout(forceDark, 50);
        setTimeout(forceDark, 250);
        setTimeout(forceDark, 1000);
    });

    window.addEventListener("load", function () {
        forceDark();
        setTimeout(forceDark, 250);
        setTimeout(forceDark, 1000);
        setTimeout(forceDark, 2500);
    });
})();
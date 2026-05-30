(function () {
    "use strict";

    function installStorageShim() {
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

    function setDefaultCyberChefOptions() {
        try {
            var existing = localStorage.getItem("options");
            var options = existing ? JSON.parse(existing) : {};

            options.theme = options.theme || "dark";
            options.wordWrap = true;
            options.showErrors = true;

            localStorage.setItem(
                "options",
                JSON.stringify(options)
            );
        } catch (e) {}
    }

    function loadCyberChefMain() {
        var script = document.createElement("script");

        script.src = "assets/main.js";
        script.defer = false;

        document.head.appendChild(script);
    }

    installStorageShim();
    setDefaultCyberChefOptions();
    loadCyberChefMain();
})();
(() => {
    "use strict";

    const Storage = {
        read(key, fallback = null) {
            try {
                return localStorage.getItem(key) ?? fallback;
            } catch (err) {
                return fallback;
            }
        },
        write(key, value) {
            try {
                localStorage.setItem(key, String(value));
                return true;
            } catch (err) {
                return false;
            }
        },
        remove(key) {
            try {
                localStorage.removeItem(key);
                return true;
            } catch (err) {
                return false;
            }
        }
    };

    window.ZZXCyberChefModules.Storage = Storage;
})();

(() => {

    "use strict";

    function $(id) {
        return document.getElementById(id);
    }

    function cfg() {
        return window.ZZX?.CYBERCHEF || {};
    }

    function ready(fn) {

        if (
            document.readyState ===
            "loading"
        ) {

            document.addEventListener(
                "DOMContentLoaded",
                fn
            );

            return;
        }

        fn();
    }

    function save(key, value) {

        try {

            localStorage.setItem(
                key,
                value
            );

        } catch (err) {

            console.warn(
                err
            );
        }
    }

    function load(key, fallback = null) {

        try {

            const value =
                localStorage.getItem(
                    key
                );

            return value ??
                fallback;

        } catch (err) {

            return fallback;
        }
    }

    function getSourceLabel(source) {

        if (
            source ===
            "upstream"
        ) {

            return (
                "GCHQ CyberChef"
            );
        }

        return (
            "Local ZZX CyberChef"
        );
    }

    function getSourceURL(source) {

        const c = cfg();

        if (
            source ===
            "upstream"
        ) {

            return (
                c.upstreamUrl
            );
        }

        return (
            c.localUrl
        );
    }

    function updateStatus(text) {

        const c = cfg();

        const el =
            $(c.statusId);

        if (!el) {
            return;
        }

        el.textContent =
            text;
    }

    function updateSourceLabel(
        source
    ) {

        const c = cfg();

        const el =
            $(c.activeSourceId);

        if (!el) {
            return;
        }

        el.textContent =
            getSourceLabel(
                source
            );
    }

    function updateFrameState(
        text
    ) {

        const c = cfg();

        const el =
            $(c.frameStateId);

        if (!el) {
            return;
        }

        el.textContent =
            text;
    }

    function loadCyberChef() {

        const c = cfg();

        const frame =
            $(c.iframeId);

        const source =
            $(c.sourceId);

        if (
            !frame ||
            !source
        ) {
            return;
        }

        const value =
            source.value;

        updateStatus(
            `Loading ${getSourceLabel(value)}...`
        );

        updateFrameState(
            "Loading..."
        );

        updateSourceLabel(
            value
        );

        frame.src =
            getSourceURL(
                value
            );

        save(
            c.storageKeys.source,
            value
        );

        save(
            c.storageKeys.lastLoaded,
            new Date()
                .toISOString()
        );
    }

    function refreshFrame() {

        const c = cfg();

        const frame =
            $(c.iframeId);

        if (!frame) {
            return;
        }

        updateFrameState(
            "Refreshing..."
        );

        frame.src =
            frame.src;
    }

    function attachFrameEvents() {

        const c = cfg();

        const frame =
            $(c.iframeId);

        if (!frame) {
            return;
        }

        frame.addEventListener(
            "load",
            () => {

                updateFrameState(
                    "Ready"
                );

                const source =
                    $(
                        c.sourceId
                    )?.value ||
                    "local";

                updateStatus(
                    `${getSourceLabel(source)} loaded successfully.`
                );
            }
        );

        frame.addEventListener(
            "error",
            () => {

                updateFrameState(
                    "Error"
                );

                updateStatus(
                    "CyberChef failed to load."
                );
            }
        );
    }

    ready(() => {

        const c = cfg();

        const source =
            $(c.sourceId);

        const loadButton =
            $(c.loadButtonId);

        const refreshButton =
            $(c.refreshButtonId);

        if (
            source
        ) {

            const saved =
                load(
                    c.storageKeys.source,
                    c.defaultSource
                );

            source.value =
                saved;
        }

        loadButton
            ?.addEventListener(
                "click",
                loadCyberChef
            );

        refreshButton
            ?.addEventListener(
                "click",
                refreshFrame
            );

        attachFrameEvents();

        loadCyberChef();

        console.info(
            "[CyberChefZZX] Initialized."
        );
    });

})();
(() => {
    "use strict";

    const SOURCES = Object.freeze({
        map: "../maps/data/map-vectors.json",
        live: "../live-map/data/map-vectors.json",
        canonical: "../api/snapshots/latest.json"
    });

    let ROWS = [];

    const $ = selector => document.querySelector(selector);

    function fmt(value) {
        if (value === null || value === undefined || value === "") return "—";
        if (typeof value === "number") return value.toLocaleString();
        return String(value);
    }

    function num(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }

    function flag(code) {
        const iso = String(code || "").trim().toUpperCase();
        if (!/^[A-Z]{2}$/.test(iso)) return "";
        return String.fromCodePoint(...[...iso].map(ch => 127397 + ch.charCodeAt(0)));
    }

    function countryLabel(row) {
        const code = String(row.countryCode || "").trim().toUpperCase();
        const name = String(row.countryName || row.country || "").trim();
        const f = row.countryFlag || flag(code);
        return [f, code, name && name !== code ? name : ""].filter(Boolean).join(" ") || "Unknown";
    }

    function setStatus(message, mode = "") {
        const el = $("#bn-status");
        if (!el) return;
        el.className = `bn-status container ${mode}`.trim();
        el.textContent = message;
    }

    async function getJson(url) {
        const join = url.includes("?") ? "&" : "?";
        const response = await fetch(`${url}${join}t=${Date.now()}`, {
            cache: "no-store",
            credentials: "same-origin"
        });
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        return response.json();
    }

    function networkFromAddress(address, explicit) {
        const value = String(explicit || "").trim().toLowerCase();
        if (value) return value;
        const text = String(address || "").toLowerCase();
        if (text.includes(".onion")) return "tor";
        if (text.includes(".i2p")) return "i2p";
        if (text.includes(":")) return "ipv6";
        return "ipv4";
    }

    function normalizedRow(address, row) {
        if (!row || typeof row !== "object" || Array.isArray(row)) return null;
        const geo = row.geo_contract && typeof row.geo_contract === "object" ? row.geo_contract : {};
        const lat = num(row.latitude ?? row.lat ?? geo.latitude);
        const lon = num(row.longitude ?? row.lon ?? row.lng ?? geo.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
        if (geo.synthetic === true) return null;

        const countryCode = String(
            row.country_code ?? row.country ?? geo.country_code ?? ""
        ).trim().toUpperCase();

        return {
            node: row.address || row.node || row.addr || address || "Unknown",
            ip: row.ip || "",
            agent: row.user_agent || row.agent || row.subver || "Unknown",
            city: row.city || geo.city || "",
            county: row.county || row.admin2 || geo.county || "",
            region: row.region || geo.region || "",
            countryCode: /^[A-Z]{2}$/.test(countryCode) ? countryCode : "",
            countryName: row.country_name || geo.country_name || "",
            countryFlag: row.country_flag || geo.country_flag || flag(countryCode),
            lat,
            lon,
            asn: row.asn || "",
            org: row.organization || row.org || "",
            provider: row.provider || "",
            network: networkFromAddress(row.address || address, row.network),
            height: num(row.height),
            geoSource: row.geo_source || geo.source || "",
            countySource: geo.county_source || row.county_source || ""
        };
    }

    function rowsFromCanonical(data) {
        const raw = data?.nodes;
        const rows = [];
        if (Array.isArray(raw)) {
            raw.forEach((row, index) => {
                const normalized = normalizedRow(row?.address || `node-${index}`, row);
                if (normalized) rows.push(normalized);
            });
        } else if (raw && typeof raw === "object") {
            Object.entries(raw).forEach(([address, row]) => {
                const normalized = normalizedRow(address, row);
                if (normalized) rows.push(normalized);
            });
        }
        return rows;
    }

    function rowsFromVectors(data) {
        const points = Array.isArray(data?.points)
            ? data.points
            : Array.isArray(data?.vectors?.points)
                ? data.vectors.points
                : [];
        return points.map((row, index) => normalizedRow(row?.address || row?.node || `point-${index}`, row)).filter(Boolean);
    }

    function rowsFromGeoJson(data) {
        if (data?.type !== "FeatureCollection" || !Array.isArray(data.features)) return [];
        return data.features.map((feature, index) => {
            if (!feature || typeof feature !== "object") return null;
            const props = feature.properties && typeof feature.properties === "object" ? feature.properties : {};
            const coords = feature.geometry?.coordinates;
            if (!Array.isArray(coords) || coords.length < 2) return null;
            return normalizedRow(feature.id || props.address || `feature-${index}`, {
                ...props,
                longitude: coords[0],
                latitude: coords[1]
            });
        }).filter(Boolean);
    }

    function normalize(data) {
        if (!data || typeof data !== "object") return [];
        const vectorRows = rowsFromVectors(data);
        if (vectorRows.length) return vectorRows;
        const geoRows = rowsFromGeoJson(data);
        if (geoRows.length) return geoRows;
        return rowsFromCanonical(data);
    }

    function project(lat, lon) {
        return {
            x: ((lon + 180) / 360) * 100,
            y: ((90 - lat) / 180) * 100
        };
    }

    function filteredRows() {
        const search = ($("#bn-search")?.value || "").trim().toLowerCase();
        if (!search) return ROWS;
        return ROWS.filter(row => [
            row.node, row.ip, row.city, row.county, row.region,
            row.countryCode, row.countryName, row.asn, row.org,
            row.provider, row.agent, row.network, row.geoSource
        ].join(" ").toLowerCase().includes(search));
    }

    function groupRows(rows) {
        const group = $("#bn-group")?.value || "country";
        const map = new Map();

        for (const row of rows) {
            const country = countryLabel(row);
            const key =
                group === "city" ? `${row.city || "Unknown city"}, ${country}` :
                group === "county" ? `${row.county || "Unknown county"}, ${row.region || "Unknown region"}, ${country}` :
                group === "asn" ? (row.asn || "Unknown ASN") :
                country;

            if (!map.has(key)) {
                map.set(key, {
                    key,
                    count: 0,
                    lat: 0,
                    lon: 0,
                    agents: new Set(),
                    countries: new Set(),
                    networks: new Set(),
                    providers: new Set()
                });
            }

            const item = map.get(key);
            item.count += 1;
            item.lat += row.lat;
            item.lon += row.lon;
            if (row.agent) item.agents.add(row.agent);
            if (row.countryCode) item.countries.add(row.countryCode);
            if (row.network) item.networks.add(row.network);
            if (row.provider) item.providers.add(row.provider);
        }

        return [...map.values()].map(item => ({
            ...item,
            lat: item.lat / item.count,
            lon: item.lon / item.count,
            agents: item.agents.size,
            countries: item.countries.size,
            networks: [...item.networks].join(", "),
            providers: item.providers.size
        })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
    }

    function addSummaryCard(target, label, value) {
        const card = document.createElement("article");
        card.className = "bn-card";
        const span = document.createElement("span");
        span.textContent = label;
        const strong = document.createElement("strong");
        strong.textContent = fmt(value);
        card.append(span, strong);
        target.appendChild(card);
    }

    function renderSummary(rows) {
        const target = $("#bn-summary");
        if (!target) return;
        const countries = new Set(rows.map(row => row.countryCode).filter(Boolean));
        const cities = new Set(rows.filter(row => row.city).map(row => `${row.city}|${row.countryCode}`));
        const counties = new Set(rows.filter(row => row.county).map(row => `${row.county}|${row.region}|${row.countryCode}`));
        target.replaceChildren();
        addSummaryCard(target, "Mapped Nodes", rows.length);
        addSummaryCard(target, "Countries", countries.size);
        addSummaryCard(target, "Cities", cities.size);
        addSummaryCard(target, "Counties / Admin-2", counties.size);
    }

    function renderMap(groups) {
        const map = $("#bn-map");
        if (!map) return;
        map.replaceChildren();
        for (const item of groups.slice(0, 1500)) {
            const point = project(item.lat, item.lon);
            const dot = document.createElement("span");
            dot.className = "bn-map-dot";
            dot.dataset.density = item.count >= 25 ? "high" : "normal";
            dot.style.left = `${point.x}%`;
            dot.style.top = `${point.y}%`;
            dot.title = `${item.key} | ${item.count.toLocaleString()} nodes`;
            map.appendChild(dot);
        }
    }

    function addCardLine(card, label, value) {
        const span = document.createElement("span");
        span.textContent = `${label}: ${fmt(value)}`;
        card.appendChild(span);
    }

    function renderRows(groups) {
        const view = $("#bn-view");
        if (!view) return;
        view.replaceChildren();
        if (!groups.length) {
            const empty = document.createElement("div");
            empty.className = "bn-empty";
            empty.textContent = "No map groups matched current filters.";
            view.appendChild(empty);
            return;
        }
        const list = document.createElement("div");
        list.className = "bn-map-list";
        for (const item of groups.slice(0, 100)) {
            const card = document.createElement("article");
            card.className = "bn-map-card";
            const title = document.createElement("strong");
            title.textContent = item.key;
            card.appendChild(title);
            addCardLine(card, "Nodes", item.count);
            addCardLine(card, "Agents", item.agents);
            addCardLine(card, "Countries", item.countries);
            addCardLine(card, "Providers", item.providers);
            addCardLine(card, "Networks", item.networks);
            addCardLine(card, "Lat/Lon", `${item.lat.toFixed(4)}, ${item.lon.toFixed(4)}`);
            list.appendChild(card);
        }
        view.appendChild(list);
    }

    function rerender() {
        const rows = filteredRows();
        const groups = groupRows(rows);
        renderSummary(rows);
        renderMap(groups);
        renderRows(groups);
    }

    async function readSource(source) {
        if (source === "map") return getJson(SOURCES.map);
        if (source === "live") return getJson(SOURCES.live);
        return getJson(SOURCES.canonical);
    }

    async function loadMap() {
        const source = $("#bn-source")?.value || "map";
        setStatus(`Loading local Bitnodes map telemetry from ${source}…`);
        try {
            const data = await readSource(source);
            ROWS = normalize(data);
            rerender();
            const geoText = ROWS.length ? "real coordinate rows" : "no real coordinates";
            setStatus(`Loaded ${fmt(ROWS.length)} ${geoText} from local ${source} data.`, ROWS.length ? "ok" : "warn");
        } catch (err) {
            ROWS = [];
            rerender();
            setStatus(`Map telemetry unavailable: ${err.message}`, "warn");
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        $("#bn-refresh")?.addEventListener("click", loadMap);
        $("#bn-source")?.addEventListener("change", loadMap);
        $("#bn-search")?.addEventListener("input", rerender);
        $("#bn-group")?.addEventListener("change", rerender);
        loadMap();
    });
})();

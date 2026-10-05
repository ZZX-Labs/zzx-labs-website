(() => {
    "use strict";
    const releases = [
    {
        "version": "11.5.0",
        "date": "2026-09-18"
    },
    {
        "version": "11.4.0",
        "date": "2026-08-18"
    },
    {
        "version": "11.3.0",
        "date": "2026-07-24"
    },
    {
        "version": "11.2.0",
        "date": "2026-06-17"
    },
    {
        "version": "11.1.0",
        "date": "2026-06-13"
    },
    {
        "version": "11.0.0",
        "date": "2026-04-28"
    },
    {
        "version": "10.24.0",
        "date": "2026-04-27"
    },
    {
        "version": "10.23.0",
        "date": "2026-04-06"
    },
    {
        "version": "10.22.0",
        "date": "2026-02-11"
    },
    {
        "version": "10.21.0",
        "date": "2026-02-05"
    },
    {
        "version": "10.20.0",
        "date": "2026-01-28"
    },
    {
        "version": "10.19.0",
        "date": "2024-06-21"
    },
    {
        "version": "10.18.0",
        "date": "2024-04-24"
    },
    {
        "version": "10.17.0",
        "date": "2024-04-13"
    },
    {
        "version": "10.16.0",
        "date": "2024-04-12"
    },
    {
        "version": "10.15.0",
        "date": "2024-04-02"
    },
    {
        "version": "10.14.0",
        "date": "2024-03-31"
    },
    {
        "version": "10.13.0",
        "date": "2024-03-30"
    },
    {
        "version": "10.12.0",
        "date": "2024-03-29"
    },
    {
        "version": "10.11.0",
        "date": "2024-03-29"
    },
    {
        "version": "10.10.0",
        "date": "2024-03-27"
    },
    {
        "version": "10.9.0",
        "date": "2024-03-26"
    },
    {
        "version": "10.8.0",
        "date": "2024-02-13"
    },
    {
        "version": "10.7.0",
        "date": "2024-02-09"
    },
    {
        "version": "10.6.0",
        "date": "2024-02-03"
    },
    {
        "version": "10.5.0",
        "date": "2023-07-14"
    },
    {
        "version": "10.4.0",
        "date": "2023-03-24"
    },
    {
        "version": "10.3.0",
        "date": "2023-03-24"
    },
    {
        "version": "10.2.0",
        "date": "2023-03-23"
    },
    {
        "version": "10.1.0",
        "date": "2023-03-23"
    },
    {
        "version": "10.0.0",
        "date": "2023-03-22"
    },
    {
        "version": "9.55.0",
        "date": "2022-12-09"
    },
    {
        "version": "9.54.0",
        "date": "2022-11-25"
    },
    {
        "version": "9.53.0",
        "date": "2022-11-25"
    },
    {
        "version": "9.52.0",
        "date": "2022-11-25"
    },
    {
        "version": "9.51.0",
        "date": "2022-11-25"
    },
    {
        "version": "9.50.0",
        "date": "2022-11-25"
    },
    {
        "version": "9.49.0",
        "date": "2022-11-11"
    },
    {
        "version": "9.48.0",
        "date": "2022-10-14"
    },
    {
        "version": "9.47.0",
        "date": "2022-10-14"
    },
    {
        "version": "9.46.0",
        "date": "2022-07-08"
    },
    {
        "version": "9.45.0",
        "date": "2022-07-08"
    },
    {
        "version": "9.44.0",
        "date": "2022-07-08"
    },
    {
        "version": "9.43.0",
        "date": "2022-07-08"
    },
    {
        "version": "9.42.0",
        "date": "2022-07-08"
    },
    {
        "version": "9.41.0",
        "date": "2022-07-08"
    },
    {
        "version": "9.40.0",
        "date": "2022-07-08"
    },
    {
        "version": "9.39.0",
        "date": "2022-06-09"
    },
    {
        "version": "9.38.0",
        "date": "2022-05-30"
    },
    {
        "version": "9.37.0",
        "date": "2022-03-29"
    },
    {
        "version": "9.36.0",
        "date": "2022-03-29"
    },
    {
        "version": "9.35.0",
        "date": "2022-03-28"
    },
    {
        "version": "9.34.0",
        "date": "2022-03-28"
    },
    {
        "version": "9.33.0",
        "date": "2022-03-25"
    },
    {
        "version": "9.32.0",
        "date": "2021-08-18"
    },
    {
        "version": "9.31.0",
        "date": "2021-08-10"
    },
    {
        "version": "9.30.0",
        "date": "2021-08-10"
    },
    {
        "version": "9.29.0",
        "date": "2021-07-28"
    },
    {
        "version": "9.28.0",
        "date": "2021-03-26"
    },
    {
        "version": "9.27.0",
        "date": "2021-02-12"
    },
    {
        "version": "9.26.0",
        "date": "2021-02-11"
    },
    {
        "version": "9.25.0",
        "date": "2021-02-11"
    },
    {
        "version": "9.24.0",
        "date": "2021-02-02"
    },
    {
        "version": "9.23.0",
        "date": "2021-02-01"
    },
    {
        "version": "9.22.0",
        "date": "2021-02-01"
    },
    {
        "version": "9.21.0",
        "date": "2020-06-12"
    },
    {
        "version": "9.20.0",
        "date": "2020-03-27"
    },
    {
        "version": "9.19.0",
        "date": "2020-03-24"
    },
    {
        "version": "9.18.0",
        "date": "2020-03-13"
    },
    {
        "version": "9.17.0",
        "date": "2020-03-13"
    },
    {
        "version": "9.16.0",
        "date": "2020-03-06"
    },
    {
        "version": "9.15.0",
        "date": "2020-03-05"
    },
    {
        "version": "9.14.0",
        "date": "2020-03-05"
    },
    {
        "version": "9.13.0",
        "date": "2020-02-13"
    },
    {
        "version": "9.12.0",
        "date": "2019-12-20"
    },
    {
        "version": "9.11.0",
        "date": "2019-11-06"
    },
    {
        "version": "9.10.0",
        "date": "2019-11-06"
    },
    {
        "version": "9.9.0",
        "date": "2019-11-01"
    },
    {
        "version": "9.8.0",
        "date": "2019-10-31"
    },
    {
        "version": "9.7.0",
        "date": "2019-09-13"
    },
    {
        "version": "9.6.0",
        "date": "2019-09-04"
    },
    {
        "version": "9.5.0",
        "date": "2019-09-04"
    },
    {
        "version": "9.4.0",
        "date": "2019-08-30"
    },
    {
        "version": "9.3.0",
        "date": "2019-08-30"
    },
    {
        "version": "9.2.0",
        "date": "2019-08-23"
    },
    {
        "version": "9.1.0",
        "date": "2019-08-22"
    },
    {
        "version": "9.0.0",
        "date": "2019-07-09"
    },
    {
        "version": "8.38.0",
        "date": "2019-07-03"
    },
    {
        "version": "8.37.0",
        "date": "2019-07-03"
    },
    {
        "version": "8.36.0",
        "date": "2019-07-03"
    },
    {
        "version": "8.35.0",
        "date": "2019-07-03"
    },
    {
        "version": "8.34.0",
        "date": "2019-06-28"
    },
    {
        "version": "8.33.0",
        "date": "2019-06-27"
    },
    {
        "version": "8.32.0",
        "date": "2019-06-27"
    },
    {
        "version": "8.31.0",
        "date": "2019-04-12"
    },
    {
        "version": "8.30.0",
        "date": "2019-04-12"
    },
    {
        "version": "8.29.0",
        "date": "2019-03-31"
    },
    {
        "version": "8.28.0",
        "date": "2019-03-31"
    },
    {
        "version": "8.27.0",
        "date": "2019-03-14"
    },
    {
        "version": "8.26.0",
        "date": "2019-03-09"
    },
    {
        "version": "8.25.0",
        "date": "2019-03-09"
    },
    {
        "version": "8.24.0",
        "date": "2019-02-08"
    },
    {
        "version": "8.23.1",
        "date": "2019-01-18"
    },
    {
        "version": "8.23.0",
        "date": "2019-01-18"
    },
    {
        "version": "8.22.0",
        "date": "2019-01-10"
    },
    {
        "version": "8.21.0",
        "date": "2019-01-10"
    },
    {
        "version": "8.20.0",
        "date": "2019-01-09"
    },
    {
        "version": "8.19.0",
        "date": "2018-12-30"
    },
    {
        "version": "8.18.0",
        "date": "2018-12-26"
    },
    {
        "version": "8.17.0",
        "date": "2018-12-25"
    },
    {
        "version": "8.16.0",
        "date": "2018-12-19"
    },
    {
        "version": "8.15.0",
        "date": "2018-12-18"
    },
    {
        "version": "8.14.0",
        "date": "2018-12-18"
    },
    {
        "version": "8.13.0",
        "date": "2018-12-15"
    },
    {
        "version": "8.12.0",
        "date": "2018-11-21"
    },
    {
        "version": "8.11.0",
        "date": "2018-11-13"
    },
    {
        "version": "8.10.0",
        "date": "2018-11-07"
    },
    {
        "version": "8.9.0",
        "date": "2018-11-07"
    },
    {
        "version": "8.8.0",
        "date": "2018-10-10"
    },
    {
        "version": "8.7.0",
        "date": "2018-08-31"
    },
    {
        "version": "8.6.0",
        "date": "2018-08-29"
    },
    {
        "version": "8.5.0",
        "date": "2018-08-23"
    },
    {
        "version": "8.4.0",
        "date": "2018-08-23"
    },
    {
        "version": "8.3.0",
        "date": "2018-08-21"
    },
    {
        "version": "8.2.0",
        "date": "2018-08-21"
    },
    {
        "version": "8.1.0",
        "date": "2018-08-19"
    },
    {
        "version": "8.0.0",
        "date": "2018-08-05"
    },
    {
        "version": "7.0.0",
        "date": "2017-12-28"
    },
    {
        "version": "6.0.0",
        "date": "2017-09-19"
    },
    {
        "version": "5.0.0",
        "date": "2017-03-30"
    },
    {
        "version": "4.0.0",
        "date": "2016-11-28"
    }
];
    window.ZZXCyberChefModules.History = {
        releases,
        boot() {
            const root = document.querySelector("[data-cz-release-history]");
            if (!root) return;
            const frag = document.createDocumentFragment();
            releases.forEach(item => {
                const row = document.createElement("div");
                row.className = "cz-release-row";
                const v = document.createElement("strong"); v.textContent = `v${item.version}`;
                const d = document.createElement("time"); d.textContent = item.date;
                row.append(v, d); frag.appendChild(row);
            });
            root.replaceChildren(frag);
        }
    };
})();

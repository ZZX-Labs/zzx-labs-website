#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TICKER = ROOT / "__partials" / "widgets" / "bitcoin-ticker"
JS = TICKER / "js"

CANONICAL = {
    "exchange-rates.js": "ZZXBitcoinTickerExchangeRates",
    "exchanges.js": "ZZXBitcoinTickerExchanges",
    "purchasing-power.js": "ZZXBitcoinTickerPurchasingPower",
    "national-debts.js": "ZZXBitcoinTickerNationalDebts",
    "national-balances.js": "ZZXBitcoinTickerNationalBalances",
    "widget-modules.js": "ZZXBitcoinTickerWidgetModules",
    "charts.js": "ZZXBitcoinTickerCharts",
}

ALIASES = {
    "exchange-rates.js": "ZZXBitcoinTickerFX",
    "purchasing-power.js": "ZZXBitcoinTickerReferences",
    "national-debts.js": "ZZXBitcoinTickerDebts",
    "national-balances.js": "ZZXBitcoinTickerBalances",
    "widget-modules.js": "ZZXBitcoinTickerWidgetBridge",
}

LEGACY_GUARDS = {
    "fx.js": "ZZXBitcoinTickerExchangeRates",
    "references.js": "ZZXBitcoinTickerPurchasingPower",
    "debts.js": "ZZXBitcoinTickerNationalDebts",
    "balances.js": "ZZXBitcoinTickerNationalBalances",
    "widget-bridge.js": "ZZXBitcoinTickerWidgetModules",
}


def require(ok: bool, message: str) -> None:
    if not ok:
        raise AssertionError(message)


def text(path: Path) -> str:
    require(path.is_file(), f"missing {path.relative_to(ROOT)}")
    return path.read_text(encoding="utf-8")


def main() -> int:
    main_js = text(TICKER / "widget.js")
    panels = text(JS / "panels.js")

    for filename, global_name in CANONICAL.items():
        module = text(JS / filename)
        require(global_name in module, f"{filename} does not register {global_name}")
        require(filename in main_js, f"widget.js does not load {filename}")

    for filename, alias in ALIASES.items():
        module = text(JS / filename)
        require(alias in module, f"{filename} lost legacy alias {alias}")

    for filename, canonical in LEGACY_GUARDS.items():
        legacy = text(JS / filename)
        require(canonical in legacy, f"legacy {filename} can overwrite canonical {canonical}")

    require("function renderFx" not in panels, "panels.js still owns exchange-rate renderer")
    require("function renderExchanges" not in panels, "panels.js still owns exchanges renderer")
    require("ZZXBitcoinTickerExchangeRates?.render" in panels, "panels.js does not delegate exchange rates")
    require("ZZXBitcoinTickerExchanges?.render" in panels, "panels.js does not delegate exchanges")

    catalog = json.loads(text(TICKER / "reference-catalog.json"))
    page_ids = {str(row["id"]) for row in catalog.get("pages", [])}
    category_dir = JS / "purchasing-power"
    module_ids = {p.stem for p in category_dir.glob("*.js") if p.name != "registry.js"}
    require(page_ids == module_ids, f"purchasing-power modules mismatch: missing={sorted(page_ids-module_ids)} extra={sorted(module_ids-page_ids)}")
    require("purchasing-power/registry.js" in main_js, "purchasing-power registry not loaded")

    for page_id in sorted(page_ids):
        require(f'"{page_id}"' in main_js, f"loader lost purchasing-power category {page_id}")

    print(
        "bitcoin_ticker_module_selftest: PASS "
        f"canonical={len(CANONICAL)} aliases={len(ALIASES)} "
        f"purchasing_power_modules={len(module_ids)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

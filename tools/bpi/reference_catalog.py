#!/usr/bin/env python3
"""Canonical purchasing-power catalog for Bitcoin Ticker.

The browser consumes the compiled JSON artifact.  This Python file is the source
of truth so the catalog remains auditable and can be regenerated without Node,
npm, or a browser build step.

All prices are USD-normalized U.S.-equivalent reference values.  The catalog
contains no synthetic market prices.  Items without a verified reference remain
unavailable until a source adapter or curated override supplies one.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
CATALOG_PATH = ROOT / "__partials/widgets/bitcoin-ticker/reference-catalog.json"
POLICY_PATH = ROOT / "bitcoin/bpi/api/reference_market_source_policy.json"
NATIONAL_REGISTRY_PATH = ROOT / "bitcoin/bpi/api/reference_national_source_registry.json"


def page(pid: str, label: str, description: str, order: int, source_class: str = "general") -> dict[str, Any]:
    return {
        "id": pid,
        "label": label,
        "description": description,
        "order": order,
        "reference_geography": "US",
        "reference_currency": "USD",
        "source_class": source_class,
    }


PAGES = [
    page("tobacco", "Tobacco", "U.S.-equivalent regulated retail tobacco reference units.", 0, "regulated-retail"),
    page("alcohol", "Alcohol", "U.S.-equivalent beer, wine, and spirits retail reference units.", 1, "regulated-retail"),
    page("cannabis", "Cannabis", "U.S. regulated-market cannabis flower, pre-roll, and bulk reference units.", 2, "regulated-retail"),
    page("kief-hash", "Kief & Hashish", "U.S. regulated-market kief, dry-sift, bubble-hash, and hash reference units.", 3, "regulated-retail"),
    page("concentrates", "Concentrates", "U.S. regulated-market cannabis concentrate reference units.", 4, "regulated-retail"),
    page("edibles", "Edibles", "U.S. regulated-market cannabis edible reference units normalized by package and labeled cannabinoid content.", 5, "regulated-retail"),
    page("drugs", "Drugs", "Public-health and law-enforcement aggregate drug-market reference units only; no procurement links or vendor data.", 6, "restricted-aggregate"),
    page("rx-drugs", "RX Drugs", "U.S. public pharmacy, CMS, Medicare, and manufacturer reference units for common prescription medicines.", 7, "regulated-healthcare"),
    page("commodities", "Commodities", "Agricultural, food, livestock, dairy, seafood, and soft-commodity reference units.", 8, "public-market"),
    page("precious-metals", "Precious Metals", "Gold, silver, platinum-group, and other precious-metal reference units.", 9, "public-market"),
    page("semi-precious-metals", "Semi Precious Metals", "Industrial and base-metal reference units normalized to U.S. dollars.", 10, "public-market"),
    page("precious-gemstones", "Precious Gem Stones", "Reference stones by carat; grade, origin, treatment, cut, and certification materially affect value.", 11, "grade-sensitive"),
    page("semi-precious-gemstones", "Semi Precious Gem Stones", "Semi-precious, organic, and ornamental gemstone reference units.", 12, "grade-sensitive"),
    page("collectibles", "Collectibles", "Public auction and price-guide reference assets; condition and grading materially affect value.", 13, "auction-market"),
    page("fine-art", "Fine Art", "Public auction and index-based fine-art reference classes; artist, provenance, medium, and condition materially affect value.", 14, "auction-market"),
    page("vehicles", "Vehicles", "U.S.-equivalent MSRP and public transaction-price references for passenger and commercial vehicles.", 15, "public-msrp"),
    page("ships", "Ships", "Civilian watercraft and commercial-vessel reference classes using public MSRP, contract, or market data.", 16, "public-market"),
    page("planes", "Planes", "Civilian aircraft reference classes using public list price, transaction, and fleet-market data.", 17, "public-market"),
    page("water", "Water", "Municipal, bottled, bulk, treatment, and industrial water reference units.", 18, "government-statistical"),
    page("oil", "Oil", "Crude, refined petroleum, lubricant, and related oil reference units.", 19, "public-market"),
    page("fuels", "Fuels", "Natural gas, LPG, motor fuel, aviation fuel, biofuel, and hydrogen reference units.", 20, "public-market"),
    page("power-energy", "Power/Energy", "U.S. residential, commercial, industrial, wholesale, and fuel-equivalent energy references.", 21, "government-statistical"),
    page("cost-per-watt", "Cost per Watt by Energy Form", "Installed-capacity and generation-system capital-cost references normalized to dollars per watt.", 22, "government-statistical"),
    page("ammo", "Ammo", "Informational U.S. aggregate ammunition reference values only; no vendor or procurement links.", 23, "restricted-msrp"),
    page("arms", "Arms", "Informational public MSRP or official/aggregate firearm reference values only; no vendor or procurement links.", 24, "restricted-msrp"),
    page("military-equipment", "Military Equipment", "Public government budget, contract, and program-unit-cost references; informational only.", 25, "public-procurement-aggregate"),
    page("military-vehicles", "Military Vehicles", "Public program-unit-cost references for light tactical and support military vehicles.", 26, "public-procurement-aggregate"),
    page("military-heavy-vehicles", "Military Heavy Vehicles", "Public program-unit-cost references for armored and heavy military vehicles.", 27, "public-procurement-aggregate"),
    page("military-aircraft", "Military Aircraft", "Public acquisition/program-unit-cost references for military aircraft.", 28, "public-procurement-aggregate"),
    page("military-ships", "Military Ships", "Public acquisition/program-unit-cost references for naval and coast-guard vessels.", 29, "public-procurement-aggregate"),
    page("military-munitions", "Military Munitions", "Public government program-cost references for conventional munitions; no procurement links.", 30, "public-procurement-aggregate"),
    page("military-air-defense-munitions", "Military Air Defense Munitions", "Public government program-cost references for air-defense interceptors; informational only.", 31, "public-procurement-aggregate"),
    page("drones-uav-fpv", "Drones, UAVs, FPVs, Fixed Wing", "Civil/public and public-program UAV reference classes from hobby through industrial and military systems.", 32, "mixed-public-market"),
    page("umv-rov", "UMVs, Sub Drones, ROV Drones", "Public-market and public-program unmanned maritime, underwater, and ROV reference classes.", 33, "mixed-public-market"),
    page("ugv-robotics", "UGVs & Robotics", "Public-market and public-program unmanned ground and robotics reference classes.", 34, "mixed-public-market"),
]

ITEMS: list[dict[str, Any]] = []
_IDS: set[str] = set()


def add(
    pid: str,
    item_id: str,
    name: str,
    unit: str,
    *,
    group: str | None = None,
    tags: tuple[str, ...] = (),
    restricted: bool = False,
    derived_from: str | None = None,
    factor: float | None = None,
    basis: str | None = None,
) -> None:
    if item_id in _IDS:
        raise ValueError(f"duplicate reference item id: {item_id}")
    _IDS.add(item_id)
    row: dict[str, Any] = {
        "id": item_id,
        "name": name,
        "unit": unit,
        "page": pid,
        "tags": list(tags or (pid,)),
        "reference_geography": "US",
        "reference_currency": "USD",
    }
    if group:
        row["group"] = group
    if restricted:
        row["restricted_reference"] = True
    if derived_from:
        row["derived_from"] = derived_from
        row["derived_factor"] = factor
        row["derivation"] = "multiply-base-usd"
    if basis:
        row["reference_basis"] = basis
    ITEMS.append(row)


# 1 — Tobacco
add("tobacco", "tobacco", "Cigarettes (Regular) · Standard Pack", "20-count pack", group="Cigarettes", tags=("tobacco","cigarettes","legacy-id"))
add("tobacco", "cigarettes_100s_pack", "Cigarettes (100s) · Standard Pack", "20-count pack", group="Cigarettes")
add("tobacco", "cigarettes_carton", "Cigarettes · Carton", "10 packs", group="Cigarettes", derived_from="tobacco", factor=10.0)
add("tobacco", "cigarettes_100s_carton", "Cigarettes (100s) · Carton", "10 packs", group="Cigarettes", derived_from="cigarettes_100s_pack", factor=10.0)
add("tobacco", "blunt", "Blunt", "cigar", group="Cigars & Blunts")
add("tobacco", "blunts_box", "Blunts · Box", "20-count box", group="Cigars & Blunts", derived_from="blunt", factor=20.0)
add("tobacco", "premium_cigar", "Premium Cigar", "cigar", group="Cigars & Blunts")
add("tobacco", "premium_cigar_box", "Premium Cigars · Box", "20-count box", group="Cigars & Blunts", derived_from="premium_cigar", factor=20.0)
add("tobacco", "machine_cigar", "Machine-Made Cigar", "cigar", group="Cigars & Blunts")
add("tobacco", "cigarillos_pack", "Cigarillos", "5-count pack", group="Cigars & Blunts")
add("tobacco", "pipe_tobacco", "Pipe Tobacco", "oz", group="Loose Tobacco")
add("tobacco", "rolling_tobacco", "Rolling Tobacco", "oz", group="Loose Tobacco")
add("tobacco", "hookah_tobacco", "Hookah / Shisha Tobacco", "100 g", group="Loose Tobacco")
add("tobacco", "chewing_tobacco", "Chewing Tobacco", "tin", group="Smokeless")
add("tobacco", "chewing_tobacco_can", "Chewing Tobacco Can", "can", group="Smokeless")
add("tobacco", "snus", "Snus", "can", group="Smokeless")
add("tobacco", "nicotine_pouches", "Nicotine Pouches", "20-count can", group="Smokeless")

# 2 — Alcohol
for iid,name,unit,group in [
    ("beer","Beer · Standard","6-pack","Beer"),("beer_case","Beer · Case","24-pack","Beer"),
    ("craft_beer","Craft Beer","6-pack","Beer"),("import_beer","Imported Beer","6-pack","Beer"),
    ("lager_keg","Beer · Half-Barrel Keg","15.5 gal keg","Beer"),("hard_cider","Hard Cider","6-pack","Beer & Cider"),
    ("hard_seltzer","Hard Seltzer","12-pack","Beer & Cider"),("wine","Table Wine","750 mL bottle","Wine"),
    ("premium_wine","Premium Wine","750 mL bottle","Wine"),("sparkling_wine","Sparkling Wine","750 mL bottle","Wine"),
    ("champagne","Champagne · Reference","750 mL bottle","Wine"),("port_wine","Port Wine","750 mL bottle","Wine"),
    ("boxed_wine","Boxed Wine","3 L box","Wine"),("scotch","Scotch · Blended","750 mL bottle","Spirits"),
    ("single_malt_scotch","Scotch · Single Malt","750 mL bottle","Spirits"),("bourbon","Bourbon","750 mL bottle","Spirits"),
    ("rye_whiskey","Rye Whiskey","750 mL bottle","Spirits"),("irish_whiskey","Irish Whiskey","750 mL bottle","Spirits"),
    ("vodka","Vodka","750 mL bottle","Spirits"),("rum","Rum","750 mL bottle","Spirits"),
    ("tequila","Tequila","750 mL bottle","Spirits"),("mezcal","Mezcal","750 mL bottle","Spirits"),
    ("gin","Gin","750 mL bottle","Spirits"),("brandy","Brandy","750 mL bottle","Spirits"),
    ("cognac","Cognac","750 mL bottle","Spirits"),("liqueur","Liqueur","750 mL bottle","Spirits"),
    ("sake","Sake","720 mL bottle","Rice Wine"),("soju","Soju","375 mL bottle","Rice Spirits"),
]: add("alcohol",iid,name,unit,group=group,tags=("alcohol",group.lower()))
# Safe pack derivation where unit relationship is exact.
for row in ITEMS:
    if row["id"]=="beer_case": row.update({"derived_from":"beer","derived_factor":4.0,"derivation":"multiply-base-usd"})

# 3 — Cannabis flower
add("cannabis", "cannabis", "Cannabis Flower · Ounce", "28.3495 g / oz", group="Flower", tags=("cannabis","flower","legacy-id"), restricted=True)
for iid,name,unit,factor in [
    ("cannabis_flower_g","Cannabis Flower · Gram","1 g",1/28.349523125),
    ("cannabis_flower_eighth","Cannabis Flower · Eighth","3.5 g",3.5/28.349523125),
    ("cannabis_flower_quarter","Cannabis Flower · Quarter","7 g",7/28.349523125),
    ("cannabis_flower_half_oz","Cannabis Flower · Half Ounce","14 g",14/28.349523125),
    ("cannabis_flower_2oz","Cannabis Flower · 2 Ounces","2 oz",2.0),
    ("cannabis_flower_qp","Cannabis Flower · Quarter Pound","4 oz",4.0),
    ("cannabis_flower_hp","Cannabis Flower · Half Pound","8 oz",8.0),
    ("cannabis_flower_lb","Cannabis Flower · Pound","16 oz",16.0),
    ("cannabis_flower_500g","Cannabis Flower · Half Kilogram","500 g",500/28.349523125),
    ("cannabis_flower_kg","Cannabis Flower · Kilogram","1000 g",1000/28.349523125),
    ("cannabis_flower_metric_ton","Cannabis Flower · Metric Ton","1,000 kg",1_000_000/28.349523125),
]: add("cannabis",iid,name,unit,group="Flower · Quantity",restricted=True,derived_from="cannabis",factor=factor)
for iid,name,unit in [
    ("cannabis_preroll_05g","Cannabis Pre-Roll · Half Gram","0.5 g pre-roll"),
    ("cannabis_preroll_1g","Cannabis Pre-Roll","1 g pre-roll"),
    ("cannabis_preroll_blunt_2g","Cannabis Pre-Roll Blunt","2 g pre-roll"),
    ("cannabis_preroll_pack5","Cannabis Pre-Rolls · Pack","5 × 0.5 g"),
    ("cannabis_preroll_pack10","Cannabis Pre-Rolls · Pack","10 × 0.5 g"),
    ("cannabis_infused_preroll","Infused Pre-Roll","1 g"),
]: add("cannabis",iid,name,unit,group="Pre-Rolls",restricted=True)
for iid,name,unit in [
    ("cannabis_trim_oz","Cannabis Trim","oz"),("cannabis_shake_oz","Cannabis Shake","oz"),
    ("cannabis_small_buds_oz","Cannabis Small Buds","oz"),("cannabis_premium_flower_oz","Cannabis Flower · Premium","oz"),
]: add("cannabis",iid,name,unit,group="Flower · Grade",restricted=True)

# 4 — Kief & Hashish
add("kief-hash","kief","Kief · Loose","oz",group="Kief",restricted=True,tags=("kief","legacy-id"))
add("kief-hash","kief_g","Kief · Loose","g",group="Kief",restricted=True,derived_from="kief",factor=1/28.349523125)
add("kief-hash","hash","Pressed Kief Hash","oz",group="Pressed Kief",restricted=True,tags=("hash","legacy-id"))
add("kief-hash","pressed_kief_hash_g","Pressed Kief Hash","g",group="Pressed Kief",restricted=True,derived_from="hash",factor=1/28.349523125)
for iid,name,group in [
    ("heat_pressed_kief","Heat Pressed Kief Hash","Pressed Kief"),
    ("dry_sift_full_melt","Dry Sift 90 Micron Full Melt Hash","Dry Sift"),
    ("pressed_dry_sift_full_melt","Pressed Dry Sift 90 Micron Full Melt Hash","Dry Sift"),
    ("bubble_hash","Bubble Hash","Bubble Hash"),("pressed_bubble_hash","Pressed Bubble Hash","Bubble Hash"),
    ("bubble_hash_full_melt","Bubble Hash · Full Melt","Full Melt"),("pressed_bubble_full_melt","Pressed Bubble Hash · Full Melt","Full Melt"),
    ("temple_ball","Hash · Temple Ball","Traditional Hash"),("charas","Charas","Traditional Hash"),
    ("afghan_hash","Afghan-Style Hash","Traditional Hash"),("moroccan_hash","Moroccan-Style Hash","Traditional Hash"),
    ("lebanese_hash","Lebanese-Style Hash","Traditional Hash"),("rosin_hash","Hash Rosin","Solventless"),
]:
    add("kief-hash",iid+"_g",name,"g",group=group,restricted=True)
    add("kief-hash",iid+"_oz",name,"oz",group=group,restricted=True,derived_from=iid+"_g",factor=28.349523125)
add("kief-hash","temple_ball_10g","Hash · Temple Ball","10 g",group="Traditional Hash",restricted=True,derived_from="temple_ball_g",factor=10.0)

# 5 — Concentrates
for iid,name,group in [
    ("rso","RSO","Extracts"),("honey_oil","Honey Oil","Extracts"),("distillate","Distillate","Extracts"),
    ("sauce","Sauce","Hydrocarbon / Extracts"),("sugar","Sugar","Hydrocarbon / Extracts"),("shatter","Shatter","Hydrocarbon / Extracts"),
    ("crystalline_shatter","Crystalline Shatter / Absolute","Crystalline"),("isolate_sand","Isolate Sand","Crystalline"),
    ("isolate_diamonds","Isolate Diamonds","Crystalline"),("moonrocks","Moonrocks","Infused Flower"),
    ("live_resin","Live Resin","Resin"),("cured_resin","Cured Resin","Resin"),("rosin","Rosin","Solventless"),
    ("live_rosin","Live Rosin","Solventless"),("badder_budder","Badder / Budder","Texture"),("crumble_wax","Crumble / Wax","Texture"),
    ("terp_sauce","Terp Sauce","Extracts"),("diamonds_sauce","Diamonds & Sauce","Crystalline"),
    ("hash_rosin","Hash Rosin","Solventless"),("flower_rosin","Flower Rosin","Solventless"),
    ("co2_oil","CO₂ Oil","Extracts"),("hydrocarbon_extract","Hydrocarbon Extract","Extracts"),
    ("vape_oil","Vape Oil","Vape"),("vape_cart_1g","Vape Cartridge","1 g cartridge"),
]:
    unit = group if iid=="vape_cart_1g" and group.startswith("1 g") else "g"
    if iid=="vape_cart_1g": group="Vape"; unit="1 g cartridge"
    add("concentrates",iid,name,unit,group=group,restricted=True)

# 6 — Edibles
for iid,name,unit,group in [
    ("edible_gummy_10mg","Gummy · Single Dose","10 mg THC","Gummies"),("edible_gummies_100mg","Gummies · Standard Pack","100 mg THC package","Gummies"),
    ("edible_gummies_200mg","Gummies · High-Dose Pack","200 mg THC package","Gummies"),("edible_chocolate_100mg","Chocolate Bar","100 mg THC package","Chocolate"),
    ("edible_cookie_10mg","Cookie","10 mg THC","Baked Goods"),("edible_brownie_10mg","Brownie","10 mg THC","Baked Goods"),
    ("edible_baked_100mg","Baked Goods · Package","100 mg THC package","Baked Goods"),("edible_beverage_10mg","Cannabis Beverage","10 mg THC","Beverages"),
    ("edible_beverage_100mg","Cannabis Beverage · Multi-Serve","100 mg THC","Beverages"),("edible_seltzer_5mg","Cannabis Seltzer","5 mg THC","Beverages"),
    ("edible_tincture_100mg","Tincture","100 mg THC bottle","Tinctures"),("edible_tincture_1000mg","Tincture · Concentrated","1000 mg THC bottle","Tinctures"),
    ("edible_capsules_100mg","Capsules","100 mg THC package","Capsules"),("edible_capsules_500mg","Capsules · High Strength","500 mg THC package","Capsules"),
    ("edible_honey_100mg","Infused Honey","100 mg THC jar","Pantry"),("edible_oil_100mg","Infused Cooking Oil","100 mg THC bottle","Pantry"),
    ("edible_mints_100mg","Mints","100 mg THC package","Candy"),("edible_hard_candy_100mg","Hard Candy","100 mg THC package","Candy"),
    ("edible_cbd_300mg","CBD Edible Package","300 mg CBD package","CBD"),("edible_cbd_1000mg","CBD Edible Package","1000 mg CBD package","CBD"),
]: add("edibles",iid,name,unit,group=group,restricted=True)

# 7 — Drugs (aggregate public-health/law-enforcement reference only)
for iid,name,unit,group in [
    ("drug_cocaine_powder_g","Cocaine · Powder · Aggregate Reference","g","Stimulants"),
    ("drug_crack_g","Cocaine · Crack · Aggregate Reference","g","Stimulants"),
    ("drug_meth_g","Methamphetamine · Aggregate Reference","g","Stimulants"),
    ("drug_amphetamine_g","Illicit Amphetamine · Aggregate Reference","g","Stimulants"),
    ("drug_mdma_tablet","MDMA · Aggregate Reference","tablet","Entactogens"),
    ("drug_heroin_g","Heroin · Aggregate Reference","g","Opioids"),
    ("drug_illicit_fentanyl_g","Illicit Fentanyl · Aggregate Reference","g","Opioids"),
    ("drug_counterfeit_opioid_pill","Counterfeit Opioid Pill · Aggregate Reference","tablet","Opioids"),
    ("drug_lsd_dose","LSD · Aggregate Reference","dose","Psychedelics"),
    ("drug_psilocybin_g","Psilocybin Mushrooms · Aggregate Reference","g","Psychedelics"),
    ("drug_dmt_dose","DMT · Aggregate Reference","dose","Psychedelics"),
    ("drug_ketamine_g","Ketamine · Illicit Aggregate Reference","g","Dissociatives"),
    ("drug_pcp_g","PCP · Aggregate Reference","g","Dissociatives"),
    ("drug_benzo_illicit_tablet","Illicit Benzodiazepine · Aggregate Reference","tablet","Depressants"),
]: add("drugs",iid,name,unit,group=group,restricted=True,basis="Public-health/law-enforcement aggregate only; no vendor or procurement data")

# 8 — RX Drugs
for iid,name,unit,group in [
    ("rx_amoxicillin_500_21","Amoxicillin 500 mg · Generic","21 capsules","Antibiotics"),
    ("rx_azithromycin_250_6","Azithromycin 250 mg · Generic","6 tablets","Antibiotics"),
    ("rx_doxycycline_100_20","Doxycycline 100 mg · Generic","20 tablets","Antibiotics"),
    ("rx_atovaquone_proguanil_24","Atovaquone/Proguanil · Generic","24 tablets","Anti-Infective"),
    ("rx_atorvastatin_20_30","Atorvastatin 20 mg · Generic","30 tablets","Cardiovascular"),
    ("rx_lisinopril_20_30","Lisinopril 20 mg · Generic","30 tablets","Cardiovascular"),
    ("rx_amlodipine_10_30","Amlodipine 10 mg · Generic","30 tablets","Cardiovascular"),
    ("rx_metoprolol_50_30","Metoprolol 50 mg · Generic","30 tablets","Cardiovascular"),
    ("rx_metformin_500_60","Metformin 500 mg · Generic","60 tablets","Diabetes"),
    ("rx_insulin_glargine_pen","Insulin Glargine · Reference Pen Pack","5 pens","Diabetes"),
    ("rx_insulin_lispro_vial","Insulin Lispro · Reference Vial","10 mL vial","Diabetes"),
    ("rx_semaglutide_month","Semaglutide · Reference Monthly Supply","4-week supply","Diabetes / Metabolic"),
    ("rx_albuterol_inhaler","Albuterol HFA · Generic","200-dose inhaler","Respiratory"),
    ("rx_budesonide_formoterol","Budesonide/Formoterol · Reference","inhaler","Respiratory"),
    ("rx_epinephrine_autoinjector_2","Epinephrine Auto-Injector · Generic","2-pack","Emergency"),
    ("rx_levothyroxine_100_30","Levothyroxine 100 mcg · Generic","30 tablets","Endocrine"),
    ("rx_omeprazole_20_30","Omeprazole 20 mg · Generic","30 capsules","GI"),
    ("rx_pantoprazole_40_30","Pantoprazole 40 mg · Generic","30 tablets","GI"),
    ("rx_sertraline_50_30","Sertraline 50 mg · Generic","30 tablets","Mental Health"),
    ("rx_fluoxetine_20_30","Fluoxetine 20 mg · Generic","30 capsules","Mental Health"),
    ("rx_bupropion_xl_150_30","Bupropion XL 150 mg · Generic","30 tablets","Mental Health"),
    ("rx_sumatriptan_50_9","Sumatriptan 50 mg · Generic","9 tablets","Neurology"),
    ("rx_apixaban_5_60","Apixaban 5 mg · Reference","60 tablets","Anticoagulants"),
    ("rx_rivaroxaban_20_30","Rivaroxaban 20 mg · Reference","30 tablets","Anticoagulants"),
    ("rx_naloxone_nasal_2","Naloxone Nasal Spray","2-dose package","Emergency"),
]: add("rx-drugs",iid,name,unit,group=group,basis="U.S. public pharmacy/CMS/Medicare/manufacturer aggregate")

# 9 — Commodities
for iid,name,unit,group in [
    ("corn","Corn","bushel","Grains"),("soy","Soybeans","bushel","Grains"),("wheat","Wheat","bushel","Grains"),
    ("rice","Rice","cwt","Grains"),("oats","Oats","bushel","Grains"),("barley","Barley","bushel","Grains"),
    ("sorghum","Sorghum","bushel","Grains"),("canola","Canola","cwt","Oilseeds"),("cotton","Cotton","lb","Fiber"),
    ("cocoa","Cocoa","lb","Softs"),("coffee","Coffee","lb","Softs"),("tea","Tea","lb","Softs"),
    ("sugar_food","Sugar · Food Commodity","lb","Softs"),("honey_food","Honey · Food Commodity","lb","Softs"),
    ("orange_juice","Orange Juice · Frozen Concentrate","lb","Softs"),
    ("beef","Beef","lb","Meat"),("pork","Pork","lb","Meat"),("mutton","Mutton","lb","Meat"),
    ("lamb","Lamb","lb","Meat"),("chicken","Chicken","lb","Poultry"),("duck","Duck","lb","Poultry"),
    ("turkey","Turkey","lb","Poultry"),("eggs","Eggs","dozen","Dairy & Eggs"),("milk","Milk","gallon","Dairy & Eggs"),
    ("butter","Butter","lb","Dairy & Eggs"),("cheese","Cheese","lb","Dairy & Eggs"),
    ("lobster","Lobster","lb","Seafood"),("shrimp","Shrimp","lb","Seafood"),("salmon","Salmon","lb","Seafood"),
    ("tuna","Tuna","lb","Seafood"),("cod","Cod","lb","Seafood"),("crab","Crab","lb","Seafood"),
    ("potatoes","Potatoes","10 lb","Produce"),("onions","Onions","10 lb","Produce"),("tomatoes","Tomatoes","lb","Produce"),
    ("apples","Apples","lb","Produce"),("bananas","Bananas","lb","Produce"),("avocados","Avocados","each","Produce"),
    ("lumber_1000bf","Lumber","1,000 board feet","Materials"),("rubber","Natural Rubber","lb","Materials"),
]: add("commodities",iid,name,unit,group=group)

# 10 — Precious Metals
TROY_G=31.1034768
for base,name in [("gold","Gold"),("silver","Silver"),("platinum","Platinum"),("palladium","Palladium"),("rhodium","Rhodium"),("iridium","Iridium"),("ruthenium","Ruthenium"),("osmium","Osmium")]:
    add("precious-metals",base,name,"troy oz",group="Troy Ounce",tags=("precious-metal",base,"spot"))
    add("precious-metals",f"{base}_g",name,"1 g",group="Gram",derived_from=base,factor=1/TROY_G)
    add("precious-metals",f"{base}_kg",name,"1 kg",group="Kilogram",derived_from=base,factor=1000/TROY_G)
add("precious-metals","gold_100oz_bar","Gold · 100 oz Bar","100 troy oz",group="Bullion",derived_from="gold",factor=100.0)
add("precious-metals","gold_400oz_bar","Gold · Good Delivery Bar","400 troy oz",group="Bullion",derived_from="gold",factor=400.0)
add("precious-metals","silver_100oz_bar","Silver · 100 oz Bar","100 troy oz",group="Bullion",derived_from="silver",factor=100.0)
add("precious-metals","silver_1000oz_bar","Silver · 1,000 oz Bar","1,000 troy oz",group="Bullion",derived_from="silver",factor=1000.0)

# 11 — Semi Precious / industrial metals
for iid,name in [
    ("nickel","Nickel"),("tin","Tin"),("aluminum","Aluminum"),("titanium","Titanium"),("iron","Iron"),
    ("brass","Brass"),("copper","Copper"),("bronze","Bronze"),("zinc","Zinc"),("lead","Lead"),
    ("cobalt","Cobalt"),("molybdenum","Molybdenum"),("magnesium","Magnesium"),("chromium","Chromium"),
    ("manganese","Manganese"),("tungsten","Tungsten"),("vanadium","Vanadium"),("lithium_carbonate","Lithium Carbonate"),
    ("rare_earth_neodymium","Neodymium · Reference Oxide"),("rare_earth_praseodymium","Praseodymium · Reference Oxide"),
]: add("semi-precious-metals",iid,name,"lb",group="Industrial Metals")
add("semi-precious-metals","steel","Steel","short ton",group="Bulk Metals")
add("semi-precious-metals","steel_lb","Steel","lb",group="Bulk Metals",derived_from="steel",factor=1/2000)
add("semi-precious-metals","iron_short_ton","Iron","short ton",group="Bulk Metals",derived_from="iron",factor=2000.0)
add("semi-precious-metals","copper_short_ton","Copper","short ton",group="Bulk Metals",derived_from="copper",factor=2000.0)
add("semi-precious-metals","aluminum_short_ton","Aluminum","short ton",group="Bulk Metals",derived_from="aluminum",factor=2000.0)

# 12 — Precious Gem Stones
for iid,name in [
    ("diamonds","Diamond · Reference Stone"),("ruby","Ruby · Reference Stone"),("sapphire","Sapphire · Reference Stone"),
    ("emerald","Emerald · Reference Stone"),("alexandrite","Alexandrite · Reference Stone"),
]:
    for ct in (1,2,5):
        add("precious-gemstones",f"{iid}_{ct}ct" if ct!=1 else iid,name,f"{ct} ct stone",group=f"{ct} Carat",basis="Certified reference grade required; do not derive across carat sizes")

# 13 — Semi Precious Gem Stones
for iid,name,unit in [
    ("amber","Fossilized Amber","10 g"),("pearl","Pearl · Reference","pearl"),("turquoise","Turquoise","1 ct stone"),
    ("red_coral","Fossilized Red Coral","10 g"),("jadeite","Jadeite","1 ct stone"),("nephrite","Nephrite","1 ct stone"),
    ("quartz","Quartz","1 ct stone"),("obsidian","Obsidian","100 g"),("amethyst","Amethyst","1 ct stone"),
    ("aquamarine","Aquamarine","1 ct stone"),("garnet","Garnet","1 ct stone"),("opal","Opal","1 ct stone"),
    ("topaz","Topaz","1 ct stone"),("tourmaline","Tourmaline","1 ct stone"),("lapis","Lapis Lazuli","10 g"),
    ("moonstone","Moonstone","1 ct stone"),("peridot","Peridot","1 ct stone"),("citrine","Citrine","1 ct stone"),
    ("spinel","Spinel","1 ct stone"),("tanzanite","Tanzanite","1 ct stone"),("zircon","Natural Zircon","1 ct stone"),
    ("onyx","Onyx","10 g"),("malachite","Malachite","10 g"),("agate","Agate","10 g"),
]: add("semi-precious-gemstones",iid,name,unit,group="Reference Material",basis="Grade/condition/origin sensitive")

# 14 — Collectibles
for iid,name,unit,group in [
    ("charizard_1e_holo_mint","1999 Pokémon Base Set 1st Edition Holo Charizard #4","card","Trading Cards"),
    ("pokemon_pikachu_illustrator","Pokémon Pikachu Illustrator · Reference","card","Trading Cards"),
    ("mtg_black_lotus_alpha","Magic: The Gathering Alpha Black Lotus","card","Trading Cards"),
    ("sports_mantle_1952_topps","1952 Topps Mickey Mantle #311","card","Trading Cards"),
    ("action_comics_1","Action Comics #1","comic","Comics"),("superman_1","Superman #1","comic","Comics"),
    ("batman_1","Batman #1","comic","Comics"),("amazing_fantasy_15","Amazing Fantasy #15","comic","Comics"),
    ("asm_1","Amazing Spider-Man #1","comic","Comics"),("xmen_1","X-Men #1","comic","Comics"),
    ("star_wars_1_1977","Star Wars #1 · 1977 Marvel","comic","Comics"),
    ("boba_fett_gen1","Kenner Boba Fett · Early Generation Reference","figure","Star Wars"),
    ("boba_fett_rocket_proto","Rocket-Firing Boba Fett Prototype Reference","figure","Star Wars"),
    ("vinyl_cape_jawa","Kenner Vinyl Cape Jawa Reference","figure","Star Wars"),
    ("dt_luke","Kenner Double-Telescoping Luke Reference","figure","Star Wars"),
    ("early_bird_set","Kenner Star Wars Early Bird Set Reference","set","Star Wars"),
    ("lego_millennium_falcon_ucs","LEGO UCS Millennium Falcon · Sealed Reference","set","LEGO"),
    ("lego_cafe_corner","LEGO Café Corner · Sealed Reference","set","LEGO"),
    ("nes_world_championships","Nintendo World Championships Cartridge","cartridge","Video Games"),
    ("super_mario_64_sealed","Super Mario 64 · Sealed Graded Reference","game","Video Games"),
    ("first_edition_book_reference","First-Edition Book · Collectible Reference","book","Books"),
    ("vintage_watch_reference","Vintage Mechanical Watch · Reference","watch","Watches"),
    ("rare_coin_reference","Rare Coin · Certified Reference","coin","Numismatics"),
    ("us_morgan_dollar_reference","Morgan Silver Dollar · Certified Reference","coin","Numismatics"),
    ("vintage_sneaker_reference","Vintage Sneaker · Deadstock Reference","pair","Sneakers"),
]: add("collectibles",iid,name,unit,group=group,basis="Public auction/price-guide; grade/condition sensitive")

# 15 — Fine Art
for iid,name,unit,group in [
    ("art_emerging_painting","Emerging Artist · Original Painting","work","Contemporary"),
    ("art_midcareer_painting","Mid-Career Artist · Original Painting","work","Contemporary"),
    ("art_bluechip_contemporary","Blue-Chip Contemporary Painting · Reference","work","Contemporary"),
    ("art_limited_print","Limited Edition Fine-Art Print","print","Prints"),
    ("art_signed_lithograph","Signed Lithograph · Reference","print","Prints"),
    ("art_photograph_limited","Limited Edition Fine-Art Photograph","print","Photography"),
    ("art_sculpture_small","Fine-Art Sculpture · Small","work","Sculpture"),
    ("art_sculpture_large","Fine-Art Sculpture · Large","work","Sculpture"),
    ("art_old_master_drawing","Old Master Drawing · Reference","work","Old Masters"),
    ("art_old_master_painting","Old Master Painting · Reference","work","Old Masters"),
    ("art_impressionist_painting","Impressionist Painting · Reference","work","Impressionist"),
    ("art_modern_painting","Modern Painting · Reference","work","Modern"),
    ("art_contemporary_index","Contemporary Art Auction Basket","index unit","Indices"),
    ("art_postwar_index","Post-War Art Auction Basket","index unit","Indices"),
    ("art_print_index","Fine-Art Print Auction Basket","index unit","Indices"),
]: add("fine-art",iid,name,unit,group=group,basis="Auction/index reference; provenance/condition/artist sensitive")

# 16 — Vehicles
for iid,name,unit,group in [
    ("vehicle_economy_car","Economy Car · New Reference","vehicle","Passenger Cars"),("vehicle_compact_car","Compact Car · New Reference","vehicle","Passenger Cars"),
    ("vehicle_midsize_sedan","Midsize Sedan · New Reference","vehicle","Passenger Cars"),("vehicle_luxury_sedan","Luxury Sedan · New Reference","vehicle","Passenger Cars"),
    ("vehicle_sports_car","Sports Car · New Reference","vehicle","Passenger Cars"),("vehicle_supercar","Supercar · New Reference","vehicle","Passenger Cars"),
    ("vehicle_compact_suv","Compact SUV · New Reference","vehicle","SUVs"),("vehicle_midsize_suv","Midsize SUV · New Reference","vehicle","SUVs"),
    ("vehicle_fullsize_suv","Full-Size SUV · New Reference","vehicle","SUVs"),("vehicle_pickup_half_ton","Half-Ton Pickup · New Reference","vehicle","Trucks"),
    ("vehicle_pickup_hd","Heavy-Duty Pickup · New Reference","vehicle","Trucks"),("vehicle_cargo_van","Cargo Van · New Reference","vehicle","Commercial"),
    ("vehicle_box_truck","Box Truck · New Reference","vehicle","Commercial"),("vehicle_semi_tractor","Class 8 Tractor · New Reference","vehicle","Commercial"),
    ("vehicle_ev_compact","Compact EV · New Reference","vehicle","Electric"),("vehicle_ev_sedan","EV Sedan · New Reference","vehicle","Electric"),
    ("vehicle_ev_suv","EV SUV · New Reference","vehicle","Electric"),("vehicle_ev_pickup","EV Pickup · New Reference","vehicle","Electric"),
    ("vehicle_motorcycle_entry","Motorcycle · Entry Reference","vehicle","Motorcycles"),("vehicle_motorcycle_touring","Motorcycle · Touring Reference","vehicle","Motorcycles"),
    ("vehicle_motorcycle_sport","Motorcycle · Sport Reference","vehicle","Motorcycles"),("vehicle_atv","ATV · New Reference","vehicle","Off-Road"),
    ("vehicle_utv","UTV · New Reference","vehicle","Off-Road"),("vehicle_snowmobile","Snowmobile · New Reference","vehicle","Off-Road"),
    ("vehicle_rv_class_b","Class B Camper Van · Reference","vehicle","Recreational"),("vehicle_rv_class_c","Class C RV · Reference","vehicle","Recreational"),
    ("vehicle_rv_class_a","Class A RV · Reference","vehicle","Recreational"),
]: add("vehicles",iid,name,unit,group=group,basis="U.S. MSRP/public transaction aggregate")

# 17 — Ships
for iid,name,unit,group in [
    ("ship_kayak","Recreational Kayak","vessel","Small Craft"),("ship_jetski","Personal Watercraft","vessel","Small Craft"),
    ("ship_fishing_18ft","Fishing Boat · 18 ft","vessel","Small Craft"),("ship_bass_boat","Bass Boat · Reference","vessel","Small Craft"),
    ("ship_pontoon","Pontoon Boat · Reference","vessel","Small Craft"),("ship_sailboat_30","Sailboat · 30 ft","vessel","Sail"),
    ("ship_sailboat_45","Sailboat · 45 ft","vessel","Sail"),("ship_catamaran_45","Cruising Catamaran · 45 ft","vessel","Sail"),
    ("ship_motor_yacht_50","Motor Yacht · 50 ft","vessel","Yachts"),("ship_motor_yacht_80","Motor Yacht · 80 ft","vessel","Yachts"),
    ("ship_superyacht_150","Superyacht · 150 ft Reference","vessel","Yachts"),("ship_tug","Harbor Tug · Reference","vessel","Commercial"),
    ("ship_ferry","Passenger Ferry · Reference","vessel","Commercial"),("ship_bulk_carrier","Bulk Carrier · Reference","vessel","Commercial"),
    ("ship_container_feeder","Container Ship · Feeder Reference","vessel","Commercial"),("ship_container_panamax","Container Ship · Panamax Reference","vessel","Commercial"),
    ("ship_container_ulcv","Ultra-Large Container Vessel · Reference","vessel","Commercial"),("ship_tanker_product","Product Tanker · Reference","vessel","Commercial"),
    ("ship_tanker_vlcc","VLCC Tanker · Reference","vessel","Commercial"),("ship_lng_carrier","LNG Carrier · Reference","vessel","Commercial"),
]: add("ships",iid,name,unit,group=group,basis="Public MSRP/contract/market reference")

# 18 — Planes
for iid,name,unit,group in [
    ("plane_ultralight","Ultralight Aircraft · Reference","aircraft","General Aviation"),("plane_c172","Cessna 172-Class Trainer · Reference","aircraft","General Aviation"),
    ("plane_piper_archer","Piper Archer-Class Trainer · Reference","aircraft","General Aviation"),("plane_cirrus_sr22","Cirrus SR22-Class · Reference","aircraft","General Aviation"),
    ("plane_turboprop_single","Single-Engine Turboprop · Reference","aircraft","Turboprop"),("plane_king_air","Twin Turboprop · King Air Class","aircraft","Turboprop"),
    ("plane_pc12","Pilatus PC-12 Class · Reference","aircraft","Turboprop"),("plane_light_jet","Light Business Jet · Reference","aircraft","Business Jets"),
    ("plane_midsize_jet","Midsize Business Jet · Reference","aircraft","Business Jets"),("plane_large_cabin_jet","Large-Cabin Business Jet · Reference","aircraft","Business Jets"),
    ("plane_gulfstream_g700","Gulfstream G700-Class · Reference","aircraft","Business Jets"),("plane_airliner_regional","Regional Jet · Reference","aircraft","Airliners"),
    ("plane_737max","Boeing 737 MAX-Class · Reference","aircraft","Airliners"),("plane_a320neo","Airbus A320neo-Class · Reference","aircraft","Airliners"),
    ("plane_787","Boeing 787-Class · Reference","aircraft","Airliners"),("plane_a350","Airbus A350-Class · Reference","aircraft","Airliners"),
    ("plane_7478","Boeing 747-8-Class · Reference","aircraft","Airliners"),("plane_cargo_767","Widebody Cargo Aircraft · Reference","aircraft","Cargo"),
    ("plane_helicopter_light","Light Civil Helicopter · Reference","aircraft","Helicopters"),("plane_helicopter_twin","Twin-Engine Civil Helicopter · Reference","aircraft","Helicopters"),
]: add("planes",iid,name,unit,group=group,basis="Public list-price/transaction/fleet reference")

# 19 — Water
for iid,name,unit,group in [
    ("water","Municipal Water","1,000 gallons","Municipal"),("municipal_sewer_1000gal","Municipal Water + Sewer","1,000 gallons","Municipal"),
    ("bottled_water_case","Bottled Water","24 × 500 mL case","Bottled"),("bottled_water_gallon","Bottled Water · Bulk Retail","gallon","Bottled"),
    ("bulk_potable_water","Bulk Potable Water","1,000 gallons","Bulk"),("desalinated_water","Desalinated Water","1,000 gallons","Treatment"),
    ("distilled_water","Distilled Water","gallon","Treatment"),("deionized_water","Deionized Water","gallon","Treatment"),
    ("industrial_process_water","Industrial Process Water","1,000 gallons","Industrial"),("agricultural_irrigation_water","Agricultural Irrigation Water","acre-foot","Agriculture"),
    ("water_tanker_delivery","Potable Water · Tanker Delivery","5,000 gallons","Delivery"),("water_reverse_osmosis","RO Purified Water","gallon","Treatment"),
]: add("water",iid,name,unit,group=group)

# 20 — Oil
for iid,name,unit,group in [
    ("oil","WTI Crude Oil","barrel","Crude"),("brent_oil","Brent Crude Oil","barrel","Crude"),("dubai_crude","Dubai/Oman Crude · Reference","barrel","Crude"),
    ("heating_oil","Heating Oil","gallon","Refined"),("motor_oil_quart","Motor Oil","quart","Lubricants"),("motor_oil_gallon","Motor Oil","gallon","Lubricants"),
    ("base_oil","Lubricant Base Oil","gallon","Lubricants"),("hydraulic_oil","Hydraulic Oil","gallon","Lubricants"),("gear_oil","Gear Oil","gallon","Lubricants"),
    ("transformer_oil","Transformer Oil","gallon","Industrial"),("marine_bunker_fuel","Marine Bunker Fuel","metric ton","Marine"),("bitumen","Bitumen / Asphalt Binder","short ton","Industrial"),
]: add("oil",iid,name,unit,group=group)

# 21 — Fuels
for iid,name,unit,group in [
    ("natural_gas","Natural Gas","MMBtu","Gas"),("lng","Liquefied Natural Gas","MMBtu","Gas"),("lpg","LPG","gallon","Gas"),
    ("propane","Propane","gallon","Gas"),("butane","Butane","gallon","Gas"),("gasoline_regular","Gasoline · Regular","gallon","Motor Fuel"),
    ("gasoline_midgrade","Gasoline · Midgrade","gallon","Motor Fuel"),("gasoline_premium","Gasoline · Premium","gallon","Motor Fuel"),
    ("diesel","Diesel","gallon","Motor Fuel"),("biodiesel","Biodiesel B100","gallon","Biofuel"),("kerosene","Kerosene","gallon","Distillate"),
    ("jet_a","Jet Fuel · Jet A","gallon","Aviation"),("avgas_100ll","Aviation Gasoline · 100LL","gallon","Aviation"),
    ("ethanol","Ethanol","gallon","Biofuel"),("methanol","Methanol","gallon","Alcohol Fuel"),("renewable_diesel","Renewable Diesel","gallon","Biofuel"),
    ("hydrogen","Hydrogen","kg","Hydrogen"),("hydrogen_green","Green Hydrogen · Reference","kg","Hydrogen"),
    ("coal_thermal","Thermal Coal","short ton","Solid Fuel"),("wood_pellets","Wood Pellets","short ton","Solid Fuel"),
]: add("fuels",iid,name,unit,group=group)

# 22 — Power / Energy
for iid,name,unit,group in [
    ("electricity_residential_kwh","Electricity · Residential","kWh","Retail Electricity"),
    ("electricity_commercial_kwh","Electricity · Commercial","kWh","Retail Electricity"),
    ("electricity_industrial_kwh","Electricity · Industrial","kWh","Retail Electricity"),
    ("electricity_transport_kwh","Electricity · Transportation","kWh","Retail Electricity"),
    ("electricity_wholesale_mwh","Electricity · Wholesale Hub Reference","MWh","Wholesale Electricity"),
    ("electricity_mwh","Electricity · Megawatt-hour · Residential Equivalent","MWh","Retail Electricity"),
    ("natural_gas_mmbtu","Natural Gas · Henry Hub Equivalent","MMBtu","Fuel Energy"),
    ("propane_energy_mmbtu","Propane · Energy Equivalent","MMBtu","Fuel Energy"),
    ("diesel_energy_mmbtu","Diesel · Energy Equivalent","MMBtu","Fuel Energy"),
    ("gasoline_energy_mmbtu","Gasoline · Energy Equivalent","MMBtu","Fuel Energy"),
    ("coal_energy_mmbtu","Coal · Energy Equivalent","MMBtu","Fuel Energy"),
    ("battery_storage_kwh","Battery Storage · Installed Capacity","kWh","Storage"),
    ("battery_storage_mwh","Battery Storage · Installed Capacity","MWh","Storage"),
]: add("power-energy",iid,name,unit,group=group)
# Exact unit derivations where same tariff basis applies.
for row in ITEMS:
    if row["id"]=="electricity_mwh": row.update({"derived_from":"electricity_residential_kwh","derived_factor":1000.0,"derivation":"multiply-base-usd"})
    if row["id"]=="battery_storage_mwh": row.update({"derived_from":"battery_storage_kwh","derived_factor":1000.0,"derivation":"multiply-base-usd"})

# 23 — Cost per Watt
for iid,name,unit,group in [
    ("cpw_solar_utility","Utility-Scale Solar PV · Installed","$/W","Solar"),("cpw_solar_commercial","Commercial Solar PV · Installed","$/W","Solar"),
    ("cpw_solar_residential","Residential Solar PV · Installed","$/W","Solar"),("cpw_solar_rooftop_storage","Residential Solar + Storage · Installed","$/W","Solar + Storage"),
    ("cpw_wind_onshore","Onshore Wind · Installed","$/W","Wind"),("cpw_wind_offshore","Offshore Wind · Installed","$/W","Wind"),
    ("cpw_hydro_large","Large Hydroelectric · Installed","$/W","Hydro"),("cpw_hydro_small","Small Hydroelectric · Installed","$/W","Hydro"),
    ("cpw_geothermal","Geothermal · Installed","$/W","Geothermal"),("cpw_nuclear_new","Nuclear · New Build Reference","$/W","Nuclear"),
    ("cpw_natural_gas_ccgt","Natural Gas Combined Cycle · Installed","$/W","Thermal"),("cpw_natural_gas_peaker","Natural Gas Peaker · Installed","$/W","Thermal"),
    ("cpw_coal_new","Coal · New Build Reference","$/W","Thermal"),("cpw_biomass","Biomass · Installed","$/W","Bioenergy"),
    ("cpw_battery_2h","Battery Storage · 2 Hour","$/W","Storage"),("cpw_battery_4h","Battery Storage · 4 Hour","$/W","Storage"),
    ("cpw_fuel_cell","Fuel Cell Generation · Installed","$/W","Fuel Cell"),("cpw_microgrid","Microgrid · Blended Reference","$/W","Grid"),
]: add("cost-per-watt",iid,name,unit,group=group,basis="U.S. public project/capex benchmark")

# 24 — Ammo
for iid,name,unit,group in [
    ("ammo_22lr_50",".22 LR","50-round box","Rimfire"),("ammo_223_20",".223 Remington","20-round box","Rifle"),
    ("ammo_556_20","5.56 NATO","20-round box","Rifle"),("ammo_243_20",".243 Winchester","20-round box","Rifle"),
    ("ammo_270_20",".270 Winchester","20-round box","Rifle"),("ammo_308_20",".308 Winchester","20-round box","Rifle"),
    ("ammo_762nato_20","7.62 NATO","20-round box","Rifle"),("ammo_300blk_20",".300 Blackout","20-round box","Rifle"),
    ("ammo_300wm_20",".300 Winchester Magnum","20-round box","Rifle"),("ammo_30_06_20",".30-06 Springfield","20-round box","Rifle"),
    ("ammo_450_bushmaster_20",".450 Bushmaster","20-round box","Rifle"),("ammo_450_marlin_20",".450 Marlin","20-round box","Rifle"),
    ("ammo_50bmg_10",".50 BMG · Reference","10-round box","Rifle"),("ammo_380_50",".380 Auto","50-round box","Pistol"),
    ("ammo_9mm_50","9mm Luger","50-round box","Pistol"),("ammo_40sw_50",".40 S&W","50-round box","Pistol"),
    ("ammo_10mm_50","10mm Auto","50-round box","Pistol"),("ammo_45auto_50",".45 Auto","50-round box","Pistol"),
    ("ammo_45acp_50",".45 ACP","50-round box","Pistol"),
    ("ammo_357mag_50",".357 Magnum","50-round box","Pistol"),("ammo_44mag_50",".44 Magnum","50-round box","Pistol"),
    ("ammo_12ga_25","12 Gauge","25-shell box","Shotgun"),("ammo_20ga_25","20 Gauge","25-shell box","Shotgun"),
    ("ammo_410_25",".410 Bore","25-shell box","Shotgun"),
]: add("ammo",iid,name,unit,group=group,restricted=True,basis="Public aggregate/MSRP reference only; no vendor links")

# 25 — Arms
for iid,name,group in [
    ("hk45_compact","HK45 Compact .45 Auto","Pistols"),("hk45","HK45 .45 Auto","Pistols"),
    ("hk_usp9_compact","HK USP 9mm Compact","Pistols"),("hk_usp9","HK USP 9mm","Pistols"),
    ("hk_usp45_compact","HK USP .45 Auto Compact","Pistols"),("hk_usp45_ct","HK USP .45 Auto Compact Tactical","Pistols"),
    ("hk_usp","HK USP .45 Auto","Pistols"),("hk_usp45_tactical","HK USP .45 Auto Tactical","Pistols"),
    ("hk_mk23","HK Mk23 .45 Auto Tactical","Pistols"),("glock_17","Glock 17 · Reference","Pistols"),
    ("sig_p320","SIG P320 · Reference","Pistols"),("m1911_reference","M1911-Pattern · Reference","Pistols"),
    ("remington_870","Remington 870-Class Pump Shotgun · Reference","Shotguns"),("benelli_m4","Benelli M4-Class Semi-Auto Shotgun · Reference","Shotguns"),
    ("mossberg_590","Mossberg 590-Class Pump Shotgun · Reference","Shotguns"),
    ("hk_mp5k","HK MP5K 9mm","SMGs"),("hk_mp7","HK MP7-Class · Reference","SMGs"),("hk_mp5","HK MP5 9mm","SMGs"),("hk_sp5","HK SP5","SMGs"),
    ("hk_mr556","HK MR556 / MR223","ARs"),("hk_416","HK 416-Class · Reference","ARs"),("hk_g36c","HK G36C-Class · Reference","ARs"),
    ("hk_g36","HK G36-Class · Reference","ARs"),("hk_g36k","HK G36K-Class · Reference","ARs"),("m4_carbine_reference","M4-Type Carbine · Reference","ARs"),
    ("ar15_civil_reference","AR-15-Type Civilian Rifle · Reference","ARs"),
    ("hk_91","HK 91","BRs"),("hk_93","HK 93","BRs"),("hk_g3","HK G3-Class · Reference","BRs"),
    ("hk_mr762","HK MR762 / MR308","BRs"),("hk_417","HK 417-Class · Reference","BRs"),("fn_scar17","FN SCAR 17-Class · Reference","BRs"),
    ("hk_21","HK 21-Class · Reference","LMGs/MGs"),("hk_mg4","HK MG4-Class · Reference","LMGs/MGs"),("hk_mg5","HK MG5-Class · Reference","LMGs/MGs"),
    ("m249_reference","M249-Class · Reference","LMGs/MGs"),("m240_reference","M240-Class · Reference","LMGs/MGs"),
    ("hk_sl8","HK SL8-6 .223 / 5.56","Rifles"),("remington_700_tactical","Remington Model 700 .308 Tactical","Rifles"),
    ("precision_rifle_reference","Precision Bolt-Action Rifle · Reference","Rifles"),("hunting_rifle_reference","Hunting Rifle · Reference","Rifles"),
]: add("arms",iid,name,"reference firearm",group=group,restricted=True,basis="Public MSRP/official/auction aggregate; no vendor links")

# 26 — Military Equipment
for iid,name,unit,group in [
    ("mil_body_armor_plate","Body Armor Plate · Reference","set","Individual Equipment"),("mil_ballistic_helmet","Ballistic Helmet · Reference","unit","Individual Equipment"),
    ("mil_nvg_monocular","Night Vision Monocular · Program Reference","unit","Electro-Optics"),("mil_nvg_binocular","Night Vision Binocular · Program Reference","unit","Electro-Optics"),
    ("mil_thermal_sight","Thermal Weapon/Observation Sight · Program Reference","unit","Electro-Optics"),("mil_laser_rangefinder","Laser Rangefinder · Program Reference","unit","Electro-Optics"),
    ("mil_secure_radio_handheld","Secure Tactical Handheld Radio · Program Reference","unit","Communications"),("mil_secure_radio_vehicle","Secure Tactical Vehicle Radio · Program Reference","unit","Communications"),
    ("mil_satcom_terminal","Portable SATCOM Terminal · Program Reference","unit","Communications"),("mil_radar_ground","Ground Surveillance Radar · Program Reference","system","Sensors"),
    ("mil_counter_uas_sensor","Counter-UAS Sensor Suite · Program Reference","system","Sensors"),("mil_counter_uas_jammer","Counter-UAS Electronic-Warfare System · Program Reference","system","EW"),
    ("mil_field_generator","Military Field Generator · Reference","unit","Power"),("mil_mobile_microgrid","Deployable Microgrid · Program Reference","system","Power"),
    ("mil_field_hospital_module","Deployable Field Hospital Module · Reference","module","Medical"),("mil_eod_robot","EOD Robot · Program Reference","unit","EOD"),
    ("mil_mine_detector","Military Mine Detector · Program Reference","unit","EOD"),("mil_bridge_system","Tactical Bridging System · Program Reference","system","Engineering"),
    ("mil_water_purification","Deployable Water Purification System · Reference","system","Logistics"),("mil_field_kitchen","Deployable Field Kitchen · Reference","system","Logistics"),
]: add("military-equipment",iid,name,unit,group=group,restricted=True,basis="Public government budget/contract program unit cost")

# 27 — Military Vehicles
for iid,name,unit,group in [
    ("mil_hmmwv","HMMWV-Class Tactical Vehicle","vehicle","Light Tactical"),("mil_jltv","JLTV-Class Tactical Vehicle","vehicle","Light Tactical"),
    ("mil_isv","Infantry Squad Vehicle-Class","vehicle","Light Tactical"),("mil_mrap_light","Light MRAP-Class Vehicle","vehicle","Protected Mobility"),
    ("mil_mrap_heavy","Heavy MRAP-Class Vehicle","vehicle","Protected Mobility"),("mil_ambulance_tactical","Tactical Ambulance · Reference","vehicle","Medical"),
    ("mil_cargo_truck_medium","Medium Tactical Cargo Truck","vehicle","Logistics"),("mil_cargo_truck_heavy","Heavy Tactical Cargo Truck","vehicle","Logistics"),
    ("mil_fuel_truck","Tactical Fuel Truck · Reference","vehicle","Logistics"),("mil_wrecker","Tactical Recovery/Wrecker Vehicle","vehicle","Engineering"),
    ("mil_route_clearance_vehicle","Route-Clearance Vehicle · Reference","vehicle","Engineering"),("mil_bridge_vehicle_light","Light Bridging Vehicle · Reference","vehicle","Engineering"),
]: add("military-vehicles",iid,name,unit,group=group,restricted=True,basis="Public acquisition/program unit cost")

# 28 — Military Heavy Vehicles
for iid,name,unit,group in [
    ("mil_m1a2","M1A2 Abrams-Class Main Battle Tank","vehicle","Main Battle Tanks"),("mil_leopard2","Leopard 2-Class Main Battle Tank","vehicle","Main Battle Tanks"),
    ("mil_challenger3","Challenger 3-Class Main Battle Tank","vehicle","Main Battle Tanks"),("mil_k2","K2-Class Main Battle Tank","vehicle","Main Battle Tanks"),
    ("mil_bradley","Bradley-Class IFV","vehicle","IFV"),("mil_cv90","CV90-Class IFV","vehicle","IFV"),("mil_puma_ifv","Puma-Class IFV","vehicle","IFV"),
    ("mil_sherman_reference","Historic Medium Tank · Museum/Restoration Reference","vehicle","Historic"),("mil_stryker","Stryker-Class Armored Vehicle","vehicle","APC"),
    ("mil_boxer","Boxer-Class Armored Vehicle","vehicle","APC"),("mil_m109","M109-Class Self-Propelled Howitzer","vehicle","Artillery"),
    ("mil_pzh2000","PzH 2000-Class Self-Propelled Howitzer","vehicle","Artillery"),("mil_caesar","CAESAR-Class Mobile Artillery System","vehicle","Artillery"),
    ("mil_m270","M270-Class Multiple Launch Rocket System","vehicle","Rocket Artillery"),("mil_himars","HIMARS-Class Rocket Artillery Vehicle","vehicle","Rocket Artillery"),
    ("mil_armored_recovery","Armored Recovery Vehicle · Reference","vehicle","Engineering"),("mil_armored_bridge","Armored Vehicle-Launched Bridge · Reference","vehicle","Engineering"),
    ("mil_mine_clearance_heavy","Heavy Mine-Clearance Vehicle · Reference","vehicle","Engineering"),
]: add("military-heavy-vehicles",iid,name,unit,group=group,restricted=True,basis="Public acquisition/program unit cost")

# 29 — Military Aircraft
for iid,name,unit,group in [
    ("mil_f16","F-16-Class Fighter · Program Reference","aircraft","Fighters"),("mil_f15ex","F-15EX-Class Fighter · Program Reference","aircraft","Fighters"),
    ("mil_f35a","F-35A-Class Fighter · Program Reference","aircraft","Fighters"),("mil_f35b","F-35B-Class Fighter · Program Reference","aircraft","Fighters"),
    ("mil_f35c","F-35C-Class Fighter · Program Reference","aircraft","Fighters"),("mil_rafale","Rafale-Class Fighter · Program Reference","aircraft","Fighters"),
    ("mil_typhoon","Eurofighter Typhoon-Class · Program Reference","aircraft","Fighters"),("mil_gripen","Gripen-Class Fighter · Program Reference","aircraft","Fighters"),
    ("mil_b21","B-21-Class Bomber · Program Reference","aircraft","Bombers"),("mil_b2","B-2-Class Bomber · Historical Program Reference","aircraft","Bombers"),
    ("mil_c130j","C-130J-Class Transport","aircraft","Transport"),("mil_c17","C-17-Class Strategic Transport","aircraft","Transport"),
    ("mil_a400m","A400M-Class Transport","aircraft","Transport"),("mil_kc46","KC-46-Class Tanker","aircraft","Tankers"),
    ("mil_a330_mrtt","A330 MRTT-Class Tanker","aircraft","Tankers"),("mil_e7","E-7-Class AEW&C Aircraft","aircraft","ISR / AEW"),
    ("mil_p8","P-8-Class Maritime Patrol Aircraft","aircraft","ISR / Maritime"),("mil_rc135","RC-135-Class ISR Aircraft","aircraft","ISR / AEW"),
    ("mil_ah64","AH-64-Class Attack Helicopter","aircraft","Helicopters"),("mil_uh60","UH-60-Class Utility Helicopter","aircraft","Helicopters"),
    ("mil_ch47","CH-47-Class Heavy-Lift Helicopter","aircraft","Helicopters"),("mil_v22","V-22-Class Tiltrotor","aircraft","Tiltrotor"),
    ("mil_t6","T-6-Class Trainer","aircraft","Training"),("mil_t7","T-7-Class Trainer","aircraft","Training"),
]: add("military-aircraft",iid,name,unit,group=group,restricted=True,basis="Public acquisition/program unit cost")

# 30 — Military Ships
for iid,name,unit,group in [
    ("mil_patrol_boat","Military Patrol Boat · Reference","vessel","Patrol"),("mil_fast_attack_craft","Fast Attack Craft · Reference","vessel","Patrol"),
    ("mil_lcs","Littoral Combat Ship-Class · Reference","vessel","Surface Combatants"),("mil_frigate","Guided-Missile Frigate · Reference","vessel","Surface Combatants"),
    ("mil_destroyer","Guided-Missile Destroyer · Reference","vessel","Surface Combatants"),("mil_cruiser","Guided-Missile Cruiser · Reference","vessel","Surface Combatants"),
    ("mil_amphib_lpd","Amphibious Transport Dock · Reference","vessel","Amphibious"),("mil_amphib_lha","Amphibious Assault Ship · Reference","vessel","Amphibious"),
    ("mil_carrier","Aircraft Carrier · Program Reference","vessel","Carriers"),("mil_ssk","Diesel-Electric Submarine · Reference","vessel","Submarines"),
    ("mil_ssn","Nuclear Attack Submarine · Reference","vessel","Submarines"),("mil_ssbn","Ballistic Missile Submarine · Reference","vessel","Submarines"),
    ("mil_replenishment_ship","Fleet Replenishment Ship · Reference","vessel","Auxiliary"),("mil_hospital_ship","Hospital Ship · Reference","vessel","Auxiliary"),
    ("mil_minesweeper","Mine Countermeasure Vessel · Reference","vessel","Mine Warfare"),("mil_coast_guard_cutter","Large Coast Guard Cutter · Reference","vessel","Coast Guard"),
]: add("military-ships",iid,name,unit,group=group,restricted=True,basis="Public acquisition/program unit cost")

# 31 — Military Munitions
for iid,name,unit,group in [
    ("mun_155mm_he","155 mm Artillery Projectile · Program Reference","round","Artillery"),("mun_120mm_tank","120 mm Tank Round · Program Reference","round","Tank"),
    ("mun_81mm_mortar","81 mm Mortar Round · Program Reference","round","Mortar"),("mun_120mm_mortar","120 mm Mortar Round · Program Reference","round","Mortar"),
    ("mun_gmlrs","Guided MLRS Rocket · Program Reference","round","Rocket Artillery"),("mun_atacms","Long-Range Guided Rocket · Program Reference","round","Rocket Artillery"),
    ("mun_javelin","Anti-Armor Guided Missile · Program Reference","round","Anti-Armor"),("mun_tow","Tube-Launched Anti-Armor Missile · Program Reference","round","Anti-Armor"),
    ("mun_hellfire","Air-to-Surface Guided Missile · Program Reference","round","Air-Launched"),("mun_jdam","GPS-Guided Bomb Kit · Program Reference","kit","Air-Launched"),
    ("mun_sdb","Small Diameter Bomb · Program Reference","round","Air-Launched"),("mun_cruise_missile","Conventional Cruise Missile · Program Reference","round","Stand-Off"),
    ("mun_anti_ship","Anti-Ship Missile · Program Reference","round","Anti-Ship"),("mun_torpedo_heavy","Heavyweight Torpedo · Program Reference","round","Naval"),
    ("mun_torpedo_light","Lightweight Torpedo · Program Reference","round","Naval"),("mun_nav_gun_round","Naval Gun Round · Program Reference","round","Naval"),
]: add("military-munitions",iid,name,unit,group=group,restricted=True,basis="Public government budget/program cost; no procurement links")

# 32 — Military Air Defense Munitions
for iid,name,unit,group in [
    ("ad_stinger","Short-Range Air-Defense Missile · Program Reference","interceptor","Short Range"),
    ("ad_aim9","Short-Range Air-to-Air Missile · Program Reference","interceptor","Air-to-Air"),
    ("ad_aim120","Medium-Range Air-to-Air Missile · Program Reference","interceptor","Air-to-Air"),
    ("ad_nasams","NASAMS-Class Interceptor · Program Reference","interceptor","Medium Range"),
    ("ad_patriot_pac3","Patriot PAC-3-Class Interceptor · Program Reference","interceptor","Long Range"),
    ("ad_thaad","THAAD-Class Interceptor · Program Reference","interceptor","Ballistic Missile Defense"),
    ("ad_sm2","Standard Missile 2-Class Interceptor · Program Reference","interceptor","Naval"),
    ("ad_sm3","Standard Missile 3-Class Interceptor · Program Reference","interceptor","Ballistic Missile Defense"),
    ("ad_sm6","Standard Missile 6-Class Interceptor · Program Reference","interceptor","Naval"),
    ("ad_essm","ESSM-Class Interceptor · Program Reference","interceptor","Naval"),
    ("ad_iron_dome","Short-Range Rocket-Defense Interceptor · Program Reference","interceptor","Rocket Defense"),
    ("ad_aegis_ashore","Aegis Ashore Interceptor Reference","interceptor","Ballistic Missile Defense"),
]: add("military-air-defense-munitions",iid,name,unit,group=group,restricted=True,basis="Public government program cost; no procurement links")

# 33 — Drones/UAVs/FPVs/Fixed Wing
for iid,name,unit,group in [
    ("drone_tinywhoop","Tiny-Whoop FPV Drone · Reference","aircraft","Hobby FPV"),("drone_5in_fpv","5-inch FPV Drone · Reference","aircraft","Hobby FPV"),
    ("drone_7in_longrange","7-inch Long-Range FPV Drone · Reference","aircraft","Hobby FPV"),("drone_cinewhoop","Cinewhoop Drone · Reference","aircraft","Hobby FPV"),
    ("drone_camera_consumer","Consumer Camera Drone · Reference","aircraft","Consumer"),("drone_camera_pro","Professional Camera Drone · Reference","aircraft","Professional"),
    ("drone_mapping_quad","Survey/Mapping Quadcopter · Reference","aircraft","Industrial"),("drone_agriculture","Agricultural Spraying Drone · Reference","aircraft","Industrial"),
    ("drone_thermal","Thermal Inspection Drone · Reference","aircraft","Industrial"),("drone_delivery_small","Small Delivery Drone · Reference","aircraft","Logistics"),
    ("drone_fixedwing_mapping","Fixed-Wing Mapping UAV · Reference","aircraft","Fixed Wing"),("drone_vtol_mapping","VTOL Mapping UAV · Reference","aircraft","Fixed Wing"),
    ("drone_public_safety","Public-Safety UAS · Reference","aircraft","Public Safety"),("drone_military_small_isr","Small Military ISR UAS · Program Reference","aircraft","Military ISR"),
    ("drone_military_medium_isr","Medium Military ISR UAS · Program Reference","aircraft","Military ISR"),("drone_military_large_isr","Large Military ISR UAS · Program Reference","aircraft","Military ISR"),
    ("drone_loitering_small","Small Loitering Munition · Program Reference","aircraft","Military"),("drone_loitering_medium","Medium Loitering Munition · Program Reference","aircraft","Military"),
    ("drone_target","Target Drone · Program Reference","aircraft","Military"),("drone_counter_uas_interceptor","Counter-UAS Interceptor Drone · Program Reference","aircraft","Counter-UAS"),
]: add("drones-uav-fpv",iid,name,unit,group=group,restricted=group.startswith("Military") or group=="Counter-UAS",basis="Public market or public program reference")

# 34 — UMV / ROV
for iid,name,unit,group in [
    ("rov_hobby","Hobby Underwater ROV · Reference","vehicle","ROV"),("rov_inspection","Professional Inspection ROV · Reference","vehicle","ROV"),
    ("rov_workclass","Work-Class ROV · Reference","vehicle","ROV"),("auv_research_small","Small Research AUV · Reference","vehicle","AUV"),
    ("auv_oceanographic","Oceanographic AUV · Reference","vehicle","AUV"),("usv_survey_small","Small Survey USV · Reference","vehicle","USV"),
    ("usv_hydrographic","Hydrographic Survey USV · Reference","vehicle","USV"),("usv_workboat","Unmanned Workboat · Reference","vehicle","USV"),
    ("umv_mine_countermeasure","Mine-Countermeasure UUV · Program Reference","vehicle","Military"),("umv_large_uuv","Large UUV · Program Reference","vehicle","Military"),
    ("umv_xluuv","Extra-Large UUV · Program Reference","vehicle","Military"),("umv_unmanned_patrol","Unmanned Surface Patrol Vessel · Program Reference","vehicle","Military"),
    ("umv_autonomous_sail","Autonomous Sailing Research Vessel · Reference","vehicle","Research"),("umv_subsea_glider","Subsea Glider · Reference","vehicle","Research"),
]: add("umv-rov",iid,name,unit,group=group,restricted=group=="Military",basis="Public market or public program reference")

# 35 — UGVs & Robotics
for iid,name,unit,group in [
    ("robot_mobile_base","Mobile Robot Base · Reference","robot","Research"),("robot_quadruped","Quadruped Robot · Reference","robot","Research"),
    ("robot_humanoid","Humanoid Research Robot · Reference","robot","Research"),("robot_industrial_arm","Industrial Robot Arm · Reference","robot","Industrial"),
    ("robot_cobot","Collaborative Robot Arm · Reference","robot","Industrial"),("robot_warehouse_amr","Warehouse AMR · Reference","robot","Logistics"),
    ("robot_delivery_sidewalk","Sidewalk Delivery Robot · Reference","robot","Logistics"),("robot_agriculture","Agricultural Field Robot · Reference","robot","Agriculture"),
    ("robot_mining","Autonomous Mining Vehicle System · Reference","system","Industrial"),("robot_eod_small","Small EOD Robot · Program Reference","robot","Public Safety / Military"),
    ("robot_eod_large","Large EOD Robot · Program Reference","robot","Public Safety / Military"),("robot_ugv_scout","Unmanned Ground Scout Vehicle · Program Reference","vehicle","Military"),
    ("robot_ugv_logistics","Unmanned Ground Logistics Vehicle · Program Reference","vehicle","Military"),("robot_ugv_mineclearance","Unmanned Mine-Clearance Vehicle · Program Reference","vehicle","Military"),
    ("robot_remote_weapon_platform","Unmanned Remote Platform · Program Reference","vehicle","Military"),("robot_firefighting","Firefighting Robot · Reference","robot","Public Safety"),
    ("robot_search_rescue","Search-and-Rescue Robot · Reference","robot","Public Safety"),
]: add("ugv-robotics",iid,name,unit,group=group,restricted=group=="Military",basis="Public market or public program reference")


def build_catalog() -> dict[str, Any]:
    page_ids = {p["id"] for p in PAGES}
    if len(page_ids) != len(PAGES):
        raise AssertionError("duplicate page ids")
    for row in ITEMS:
        if row["page"] not in page_ids:
            raise AssertionError(f"unknown page for {row['id']}: {row['page']}")
        base = row.get("derived_from")
        if base and base not in _IDS:
            raise AssertionError(f"derived reference {row['id']} points to unknown {base}")
    return {
        "schema": "zzx-bitcoin-ticker-reference-catalog-v5",
        "reference_market": "US",
        "reference_currency": "USD",
        "missing_value_policy": "unavailable",
        "page_count": len(PAGES),
        "item_count": len(ITEMS),
        "pages": PAGES,
        "items": ITEMS,
    }


def build_policy() -> dict[str, Any]:
    classes = {
        "regulated-retail": ["regulated-market public aggregate", "government statistical series", "validated aggregate dataset"],
        "restricted-aggregate": ["public-health statistical series", "law-enforcement aggregate dataset", "peer-reviewed market study"],
        "regulated-healthcare": ["CMS/Medicare public dataset", "government statistical series", "official manufacturer public list price", "validated public pharmacy aggregate"],
        "public-market": ["public commodity exchange", "government statistical series", "validated public API"],
        "government-statistical": ["government statistical series", "public utility/market operator", "validated public API"],
        "grade-sensitive": ["public auction/price guide", "certified trade index", "validated aggregate dataset"],
        "auction-market": ["public auction/price guide", "official auction result", "validated aggregate dataset"],
        "public-msrp": ["official manufacturer/public MSRP", "government statistical series", "validated transaction-price aggregate"],
        "restricted-msrp": ["official manufacturer/public MSRP", "government procurement aggregate", "validated aggregate dataset"],
        "public-procurement-aggregate": ["official government budget", "official contract award", "government accountability/audit report", "validated program-cost dataset"],
        "mixed-public-market": ["official manufacturer/public MSRP", "official government budget/contract", "validated public market aggregate"],
    }
    restricted_pages = {
        "cannabis", "kief-hash", "concentrates", "edibles", "drugs", "ammo", "arms",
        "military-equipment", "military-vehicles", "military-heavy-vehicles", "military-aircraft",
        "military-ships", "military-munitions", "military-air-defense-munitions",
    }
    rows = []
    for p in PAGES:
        rows.append({
            "id": p["id"],
            "label": p["label"],
            "reference_geography": "US",
            "reference_currency": "USD",
            "allowed_source_classes": classes[p["source_class"]],
            "procurement_links_allowed": False if p["id"] in restricted_pages else None,
            "missing_value_policy": "unavailable",
        })
    return {
        "schema": "zzx-reference-market-source-policy-v2",
        "updated_at": None,
        "reference_market": "US",
        "reference_currency": "USD",
        "pages": rows,
        "notes": [
            "No item receives a synthetic or guessed USD market value.",
            "Mathematically derived unit conversions are permitted only when the catalog declares derived_from and derived_factor.",
            "All retail equivalents default to a U.S.-equivalent USD reference market unless a future country-specific reference feed is explicitly selected.",
            "Controlled-drug references use public-health/law-enforcement aggregate statistics only and contain no vendor or procurement links.",
            "Cannabis/hash/concentrate/edible references use regulated-market public aggregate data only.",
            "Arms, ammunition, military systems, and munitions are informational public MSRP/program-cost references only and contain no vendor/procurement links.",
            "Collectible, fine-art, gemstone, vehicle, vessel, and aircraft values are condition/configuration sensitive and should retain source metadata.",
        ],
    }



def build_national_registry() -> dict[str, Any]:
    """Build the U.S.-equivalent source scaffold for every catalog page.

    Sources are intentionally disabled until a specific public endpoint and
    field/unit mapping has been validated.  The scaffold guarantees that every
    purchasing-power category has a defined U.S. acquisition contract without
    pretending an unverified URL is production-ready.
    """
    adapter_by_class = {
        "regulated-retail": "government_json_csv",
        "restricted-aggregate": "validated_aggregate_dataset",
        "regulated-healthcare": "validated_aggregate_dataset",
        "public-market": "json_records",
        "government-statistical": "government_json_csv",
        "grade-sensitive": "licensed_or_public_price_index",
        "auction-market": "auction_aggregate",
        "public-msrp": "official_msrp_aggregate",
        "restricted-msrp": "official_msrp_aggregate",
        "public-procurement-aggregate": "validated_aggregate_dataset",
        "mixed-public-market": "validated_aggregate_dataset",
    }
    source_class_label = {
        "regulated-retail": "regulated-market public aggregate",
        "restricted-aggregate": "public-health/law-enforcement aggregate",
        "regulated-healthcare": "government/regulated healthcare aggregate",
        "public-market": "validated public market API",
        "government-statistical": "government statistical series",
        "grade-sensitive": "validated grade-sensitive aggregate",
        "auction-market": "public auction/price guide aggregate",
        "public-msrp": "official manufacturer/public MSRP",
        "restricted-msrp": "official/public MSRP aggregate",
        "public-procurement-aggregate": "official government budget/contract aggregate",
        "mixed-public-market": "validated public market/program aggregate",
    }
    sources=[]
    for p in PAGES:
        cls=str(p["source_class"])
        sources.append({
            "id": f"us_{p['id'].replace('-', '_')}",
            "label": f"US {p['label']} national/equivalent reference",
            "page": p["id"],
            "country_code": "US",
            "adapter": adapter_by_class[cls],
            "url": None,
            "enabled": False,
            "source_class": source_class_label[cls],
            "requires": "validated public U.S. endpoint/dataset + exact item/unit mapping",
            "series": None,
        })
    return {
        "schema": "zzx-reference-national-source-registry-v2",
        "updated_at": None,
        "default_country": "US",
        "reference_currency": "USD",
        "page_count": len(PAGES),
        "aggregation": {
            "item_average": "weighted mean when observation weights exist; otherwise arithmetic mean",
            "diagnostics": ["mean","median","minimum","maximum","sample_count","source_count"],
            "category_summary": "equal item-class mean of available item U.S. averages; heterogeneous units explicitly flagged",
            "missing": "unavailable; never substitute a guessed or non-U.S. retail value",
        },
        "sources": sources,
        "notes": [
            "Every purchasing-power page has a U.S. source contract, but unverified mappings remain disabled.",
            "A source must provide or be normalized to USD and the exact catalog unit before activation.",
            "Global commodity spot feeds may be displayed as benchmarks but do not become U.S. retail averages automatically.",
            "Restricted categories use public aggregate/MSRP/program-cost data only and never vendor/procurement URLs.",
        ],
    }

def write() -> None:
    CATALOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    POLICY_PATH.parent.mkdir(parents=True, exist_ok=True)
    NATIONAL_REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
    CATALOG_PATH.write_text(json.dumps(build_catalog(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    POLICY_PATH.write_text(json.dumps(build_policy(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    NATIONAL_REGISTRY_PATH.write_text(json.dumps(build_national_registry(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def check() -> None:
    expected_catalog = build_catalog()
    expected_policy = build_policy()
    expected_registry = build_national_registry()
    actual_catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    actual_policy = json.loads(POLICY_PATH.read_text(encoding="utf-8"))
    actual_registry = json.loads(NATIONAL_REGISTRY_PATH.read_text(encoding="utf-8"))
    if actual_catalog != expected_catalog:
        raise SystemExit("reference-catalog.json is out of date; run reference_catalog.py --write")
    if actual_policy != expected_policy:
        raise SystemExit("reference_market_source_policy.json is out of date; run reference_catalog.py --write")
    if actual_registry != expected_registry:
        raise SystemExit("reference_national_source_registry.json is out of date; run reference_catalog.py --write")
    print(f"reference catalog valid: pages={len(PAGES)} items={len(ITEMS)} US-source-contracts={len(expected_registry['sources'])}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    if args.write:
        write()
    if args.check or not args.write:
        check()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

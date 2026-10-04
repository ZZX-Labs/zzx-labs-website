from pathlib import Path
import importlib.util,json,sys
root=Path(__file__).resolve().parents[1]
sync_path=root/"tools/worldfactbook/factbook_archive_sync.py"
spec=importlib.util.spec_from_file_location("wf_sync",sync_path)
m=importlib.util.module_from_spec(spec);sys.modules["wf_sync"]=m;spec.loader.exec_module(m)
registry=json.loads((root/"__partials/widgets/global-power-grid/data/countries.json").read_text(encoding="utf-8"))
resolver=m.Resolver(registry)
text=m.html_to_text((root/"tests/fixtures/us.html").read_bytes())
record,page=m.parse_country_page(resolver,2018,text,{
    "provider":"fixture","identifier":"fixture-2018",
    "item_url":"https://example.invalid/item",
    "container_url":"https://example.invalid/us.html",
    "source_url":"https://example.invalid/us.html"
},"geos/us.html")
assert record["country"]=="US"
assert record["edition_year"]==2018
assert record["observation_year"]==2017
assert abs(record["electricity_generation_kwh"]-4.178e12)<1
assert abs(record["electricity_consumption_kwh"]-3.911e12)<1
assert abs(record["installed_capacity_kw"]-1.084e9)<1
assert record["generation_by_source_pct"]["fossilFuels"]==70.5
assert record["generation_by_source_pct"]["nuclear"]==9.1
assert record["generation_by_source_pct"]["hydro"]==7.2
assert page["inner_path"]=="geos/us.html"
print("worldfactbook_parser_selftest: PASS")

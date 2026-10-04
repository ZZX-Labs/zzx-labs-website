from pathlib import Path
root=Path(__file__).resolve().parents[1]
w=(root/".github/workflows/zzx-worldfactbook-archive-sync.yml").read_text(encoding="utf-8")
for token in [
    "--start-year 1962","--end-year 2025",
    "worldfactbook/api/electricity-history.json",
    "worldfactbook/api/reference-index.json",
    "bitcoin/power-grid/api/factbook-history.json",
    "__partials/widgets/global-power-grid/data/factbook-history.json"
]:
    assert token in w,token
print("worldfactbook_workflow_selftest: PASS")

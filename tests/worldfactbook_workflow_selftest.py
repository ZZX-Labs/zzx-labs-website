from pathlib import Path
root=Path(__file__).resolve().parents[1]
w=(root/".github/workflows/zzx-worldfactbook-archive-sync.yml").read_text()
for token in ["year_archive.py run", "WORLDFACTBOOK_PRIVATE_DATA_TOKEN", "publish_archive_indexes.py", "private-year-${{ matrix.year }}", "cancel-in-progress: false", "persist-credentials: false"]:
    assert token in w,token
publisher=(root/"tools/worldfactbook/publish_archive_indexes.py").read_text()
for path in ["worldfactbook/api/electricity-history.json", "bitcoin/power-grid/api/factbook-history.json", "__partials/widgets/global-power-grid/data/factbook-history.json"]:
    assert path in publisher,path
assert "git clean -fdx" not in w
print("worldfactbook_workflow_selftest: PASS")

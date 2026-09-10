from pathlib import Path
import json
import subprocess
import tempfile

root=Path(__file__).resolve().parents[2]
builder=root/"tools/mining/build_hashrate_by_nation_evidence.py"

with tempfile.TemporaryDirectory() as tmp:
    tmp=Path(tmp)
    pool=tmp/"pool.json"
    grid=tmp/"grid.json"
    out=tmp/"out"

    pool.write_text(json.dumps({
        "updated_at":"test",
        "pools":{
            "Pool A":{
                "allocations":[
                    {"country":"US","fraction":0.7,"confidence":0.9,"source":"fixture"},
                    {"country":"CA","fraction":0.3,"confidence":0.8,"source":"fixture"}
                ]
            }
        }
    }),encoding="utf-8")

    grid.write_text(json.dumps({
        "efficiency_j_per_th":30,
        "countries":[
            {"country":"US","miningPowerMW":1000,"confidence":0.9},
            {"country":"FR","gridGenerationMW":50000}
        ]
    }),encoding="utf-8")

    subprocess.run([
        "python",str(builder),
        "--pool-evidence",str(pool),
        "--grid",str(grid),
        "--out-dir",str(out)
    ],check=True)

    p=json.loads((out/"pool-country-evidence.json").read_text(encoding="utf-8"))
    g=json.loads((out/"power-grid-24h.json").read_text(encoding="utf-8"))

    assert len(p["pools"]["Pool A"]["allocations"])==2
    assert g["countries"][0]["miningPowerMW"]==1000
    assert "miningPowerMW" not in g["countries"][1]

print("hashrate_by_nation_builder_selftest: PASS")

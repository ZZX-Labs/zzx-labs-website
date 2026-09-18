#!/usr/bin/env python3
from collector import run_once
import json

snapshot = run_once(use_sqlite=False)
print(json.dumps({
    "source": snapshot["source"],
    "reachable_nodes": snapshot["reachable_nodes"],
    "node_count": snapshot["node_count"],
    "updated_at": snapshot["updated_at"],
}))

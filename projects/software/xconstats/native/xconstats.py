#!/usr/bin/env python3
from __future__ import annotations
import json, time
try:
    import hid
except ImportError:
    hid=None

MICROSOFT_VID=0x045E

def enumerate_microsoft():
    if hid is None: return []
    rows=[]
    for d in hid.enumerate(MICROSOFT_VID,0):
        rows.append({k:d.get(k) for k in ("vendor_id","product_id","product_string","serial_number","path","usage_page","usage")})
    return rows

def main():
    print(json.dumps({"schema":"zzx.xconstats.devices.v1","devices":enumerate_microsoft()},default=str,indent=2))
    print("Battery report decoding is controller/transport specific; no unsupported percentage is fabricated.")
if __name__=="__main__":main()

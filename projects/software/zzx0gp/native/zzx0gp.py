#!/usr/bin/env python3
from __future__ import annotations
import argparse, base64, json, os
from pathlib import Path
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--generate-identity",action="store_true")
    ap.add_argument("--out",default="zzx0gp-identity")
    a=ap.parse_args()
    if not a.generate_identity:
        print("Use --generate-identity to create a NEW local Ed25519 identity. Existing private keys are never requested.")
        return
    p=Path(a.out);p.mkdir(parents=True,exist_ok=True)
    sk=Ed25519PrivateKey.generate();pk=sk.public_key()
    priv=sk.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption())
    pub=pk.public_bytes(serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo)
    (p/"private.pem").write_bytes(priv);(p/"public.pem").write_bytes(pub)
    print(json.dumps({"created":True,"private":str(p/"private.pem"),"public":str(p/"public.pem")},indent=2))
if __name__=="__main__": main()

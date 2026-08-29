#!/usr/bin/env python3
"""Local cryptographic envelope helper for ZZX-VSS.

This utility encrypts explicit local files with AES-256-GCM using a key derived
from a local passphrase. It does not transmit documents, infer age from faces,
or perform one-to-many identity search.
"""
from __future__ import annotations
import argparse, base64, getpass, hashlib, json, os
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

def derive(password: str, salt: bytes) -> bytes:
    return PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=310_000).derive(password.encode())

def seal(path: Path, password: str) -> dict:
    data=path.read_bytes()
    salt=os.urandom(16); nonce=os.urandom(12); key=derive(password,salt)
    ct=AESGCM(key).encrypt(nonce,data,None)
    return {
        "name":path.name,
        "sha256":hashlib.sha256(data).hexdigest(),
        "cipher":"AES-256-GCM",
        "kdf":"PBKDF2-SHA256",
        "iterations":310000,
        "salt":base64.b64encode(salt).decode(),
        "nonce":base64.b64encode(nonce).decode(),
        "ciphertext":base64.b64encode(ct).decode(),
    }

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--subject-id", required=True)
    ap.add_argument("--out", default="zzxvss-envelope.json")
    a=ap.parse_args()
    pw=getpass.getpass("Local vault passphrase: ")
    if len(pw)<12: raise SystemExit("passphrase too short")
    obj={
        "schema":"zzx.vss.encrypted-envelope.v1",
        "subjectId":a.subject_id,
        "artifacts":[seal(Path(x),pw) for x in a.files],
        "releasePolicy":{
            "userAuthorizationRequired":True,
            "authoritySignatureRequired":True,
            "humanReviewRequired":True,
            "automaticCourtAccess":False,
        },
    }
    Path(a.out).write_text(json.dumps(obj,indent=2),encoding="utf-8")
    print(a.out)
if __name__=="__main__":main()

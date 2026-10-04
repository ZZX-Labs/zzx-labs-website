#!/usr/bin/env python3
"""Optional consent-based 1:1 face verification helper.

Compares exactly two operator-supplied images. It does not search a gallery,
identify an unknown person, estimate age, or make a legal/compliance decision.
"""
from __future__ import annotations
import argparse, json
import face_recognition

def first_encoding(path):
    img=face_recognition.load_image_file(path)
    enc=face_recognition.face_encodings(img)
    if len(enc)!=1:
        raise SystemExit(f"{path}: expected exactly one detectable face, found {len(enc)}")
    return enc[0]

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("id_photo")
    ap.add_argument("selfie")
    ap.add_argument("--tolerance",type=float,default=0.5)
    a=ap.parse_args()
    a_enc=first_encoding(a.id_photo); b_enc=first_encoding(a.selfie)
    distance=float(face_recognition.face_distance([a_enc],b_enc)[0])
    print(json.dumps({
        "schema":"zzx.vss.one-to-one-face-verification.v1",
        "distance":distance,
        "tolerance":a.tolerance,
        "candidate_match":distance<=a.tolerance,
        "one_to_many_identification":False,
        "age_estimation":False,
        "decision":"human review required"
    },indent=2))
if __name__=="__main__":main()

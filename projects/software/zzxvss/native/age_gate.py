#!/usr/bin/env python3
from __future__ import annotations
import argparse, datetime as dt, json

def age(dob: dt.date, today: dt.date) -> int:
    return today.year-dob.year-((today.month,today.day)<(dob.month,dob.day))

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("dob", help="YYYY-MM-DD from an operator-entered or verified document field")
    ap.add_argument("--threshold",type=int,choices=[18,21],default=18)
    a=ap.parse_args()
    dob=dt.date.fromisoformat(a.dob);today=dt.date.today();years=age(dob,today)
    print(json.dumps({"dob":a.dob,"age":years,"threshold":a.threshold,"eligible":years>=a.threshold,"facial_age_estimation":False},indent=2))
if __name__=="__main__":main()

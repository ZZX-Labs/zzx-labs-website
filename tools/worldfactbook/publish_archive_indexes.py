#!/usr/bin/env python3
"""Merge derived indexes into the latest frontend branch without publishing raw archives."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
import year_archive as archive
import global_power_grid_sync as power

COMPATIBILITY = ('worldfactbook/api/electricity-history.json','bitcoin/power-grid/api/factbook-history.json',
                 '__partials/widgets/global-power-grid/data/factbook-history.json')


def merge_power(archives,frontend,years=None):
    output=frontend/'worldfactbook/api/electricity-history.json'
    previous=archive.read(output); records=list(previous.get('records',[]));editions={}
    for root in sorted(archives.iterdir()):
        if not root.is_dir() or not root.name.isdigit() or not (root/'archive-manifest.json').exists() or (years is not None and int(root.name) not in years):continue
        archive.verify(root,int(root.name))
        doc=archive.read(root/'worldfactbook/api/electricity-history.json');records=power.merge_records(records,doc.get('records',[]))
        reference=archive.read(root/'worldfactbook/api/reference-index.json')
        for row in reference.get('editions',[]):editions[int(row.get('edition_year') or row.get('year'))]=row
    if records:
        record_years=[int(row['edition_year']) for row in records]
        ledger={**previous,'schema':power.SCHEMA,'records':records,'record_count':len(records),
                'country_count':len({row['country'] for row in records}), 'scan_start_year':1962,'scan_end_year':2027,
                'earliest_edition':min(record_years),'latest_edition':max(record_years),
                'corpus_power_years':sorted(set(record_years))}
        for name in COMPATIBILITY:archive.dump(frontend/name,ledger)
    reference=archive.read(frontend/'worldfactbook/api/reference-index.json')
    for row in reference.get('editions',[]):
        key=int(row.get('edition_year') or row.get('year'));editions.setdefault(key,row)
    if editions:
        reference['editions']=[editions[key] for key in sorted(editions)]
        # Pages are derived country/year links, never raw source documents.
        existing=reference.get('pages',[])
        new=[]
        for root in archives.iterdir():
            if root.is_dir() and root.name.isdigit() and (root/'archive-manifest.json').exists() and (years is None or int(root.name) in years):
                new.extend(archive.read(root/'worldfactbook/api/reference-index.json').get('pages',[]))
        updated={archive.row_year(row) for row in new}
        reference['pages']=archive.dedup([row for row in existing if archive.row_year(row) not in updated]+new)
        reference.update({'scan_start_year':1962,'scan_end_year':2027})
        archive.dump(frontend/'worldfactbook/api/reference-index.json',reference)


def publish(args):
    token=os.environ.get('PUBLIC_TOKEN','')
    if not archive.SLUG.fullmatch(args.repository) or not archive.valid_branch(args.branch):
        raise ValueError('Invalid frontend repository or branch')
    paths=['worldfactbook/api/'+name for name in archive.CATALOGS]+['worldfactbook/'+name for name in archive.BOUNDARY_CATALOGS]+['worldfactbook/api/year-archives.json','worldfactbook/api/reference-index.json',*COMPATIBILITY]
    with tempfile.TemporaryDirectory(prefix='wfb-public-indexes-') as temp,archive.git_auth(token) as env:
        root=Path(temp)/'frontend'
        archive.git('clone','--depth','1','--branch',args.branch,'https://github.com/'+args.repository+'.git',root,env=env)
        archive.git('config','user.name','zzx-worldfactbook-bot',cwd=root);archive.git('config','user.email','actions@github.com',cwd=root)
        for attempt in range(6):
            if attempt:
                # This isolated disposable checkout contains only our generated files.
                archive.git('fetch','origin',args.branch,cwd=root,env=env)
                archive.git('reset','--hard','origin/'+args.branch,cwd=root)
            archive.catalogs(args.archive_root,root/'worldfactbook',True);merge_power(args.archive_root,root)
            present=[name for name in paths if (root/name).is_file()]
            if not present:return
            archive.git('add','--',*present,cwd=root)
            if not archive.git('diff','--cached','--name-only',cwd=root):return
            archive.git('commit','-m','Update World Factbook derived archive indexes',cwd=root)
            try:archive.git('push','origin','HEAD:'+args.branch,cwd=root,env=env);return
            except subprocess.CalledProcessError:
                if attempt==5:raise
                time.sleep(min(8,attempt+1))


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--archive-root',type=Path,required=True)
    p.add_argument('--repository',required=True);p.add_argument('--branch',default='main');args=p.parse_args();publish(args)

if __name__=='__main__':
    try:main()
    except (ValueError,subprocess.CalledProcessError):raise SystemExit('Derived index publication failed; no raw archive files were selected')

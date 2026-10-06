#!/usr/bin/env python3
"""Partition, checksum, crawl and mirror one private World Factbook repository per year."""
from __future__ import annotations
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from ensure_private_daily_repo import ensure, api_request, SLUG, valid_branch

FIRST, LAST = 1962, 2027
PART_BYTES = 45 * 1024 * 1024
CATALOGS = ('portal-index.json', 'source-index.json', 'media-index.json', 'attribution-index.json',
            'verified-html/index.json', 'country-archive/index.json', 'leaders/index.json',
            'facts-of-the-day/index.json', 'images-of-the-day/index.json', 'flags/index.json',
            'places-of-the-day/index.json', 'legacy-features/index.json', 'daily-archive/index.json')
BOUNDARY_CATALOGS = ('boundaries/manifest.json', 'boundaries/water/manifest.json')


def read(path: Path, default=None):
    try: return json.loads(path.read_text(encoding='utf-8'))
    except FileNotFoundError: return {} if default is None else default


def dump(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    data = (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))+'\n').encode()
    if not path.exists() or path.read_bytes() != data:
        temp = path.with_name(path.name+'.tmp'); temp.write_bytes(data); temp.replace(path)


def digest(path: Path):
    h = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1 << 20), b''): h.update(block)
    return h.hexdigest()


def checked_year(year):
    year = int(year)
    if not FIRST <= year <= LAST: raise ValueError('Archive year must be 1962 through 2027')
    return year


def path_year(path):
    for part in Path(path).parts:
        match = re.match(r'^((?:19|20)\d{2})(?:$|[-.])', part)
        if match: return int(match[1])
    return None


def row_year(row):
    for key in ('edition_year', 'year', 'date', 'month', 'capture_date', 'captured_at'):
        match = re.match(r'^((?:19|20)\d{2})', str(row.get(key, '')))
        if match: return int(match[1])
    return None


def dedup(rows):
    return list({json.dumps(row, sort_keys=True, ensure_ascii=False): row for row in rows}.values())


def select_catalog(doc, year):
    result = dict(doc)
    for key, value in doc.items():
        if key == 'countries' and isinstance(value,list):
            result[key]=[{**row,'years':[entry for entry in row.get('years',[]) if row_year(entry)==year]}
                         for row in value if any(row_year(entry)==year for entry in row.get('years',[]))]
        elif isinstance(value, list) and value and all(isinstance(row, dict) for row in value):
            if any(row_year(row) is not None for row in value):
                result[key] = [row for row in value if row_year(row) == year]
        elif key == 'months' and isinstance(value, list):
            result[key] = [row for row in value if str(year) in str(row)]
        elif key == 'countries' and isinstance(value, dict):
            result[key] = {code: [row for row in rows if row_year(row) == year]
                           for code, rows in value.items() if isinstance(rows, list)}
            result[key] = {code: rows for code, rows in result[key].items() if rows}
        elif key == 'years' and isinstance(value, dict):
            result[key] = {str(year): value[str(year)]} if str(year) in value else {}
    return result


def merge_catalog(previous, incoming):
    """Sparse public indexes cannot erase records already held in a private year."""
    result = {**previous, **incoming}
    for key, value in incoming.items():
        old = previous.get(key)
        if isinstance(value, list) and isinstance(old, list):
            if all(isinstance(row, dict) for row in old+value):
                if key in ('records', 'facts', 'images'):
                    result[key] = dedup(old+value)
                else:
                    def identity(row):
                        if row.get('id') or row.get('citation_key'):return ('id',row.get('id') or row['citation_key'])
                        if key in ('editions','years'):return ('year',row_year(row))
                        if row.get('path'):return ('path',row['path'],row_year(row),row.get('month'))
                        if row.get('url') or row.get('source_url'):
                            return ('source',row.get('url') or row['source_url'],row_year(row),row.get('name'))
                        if row.get('code') or row.get('country'):
                            return ('country',row.get('code') or row['country'],row_year(row),row.get('month'))
                        return (row_year(row),row.get('month'),row.get('name'),row.get('provider'),row.get('identifier'))
                    result[key] = list({identity(row): row for row in old+value}.values())
            else: result[key] = list(dict.fromkeys(old+value))
        elif key == 'countries' and isinstance(value, dict) and isinstance(old, dict):
            result[key] = dict(old)
            for code, rows in value.items():
                result[key][code] = merge_catalog({'entries': old.get(code, [])}, {'entries': rows})['entries']
        elif key == 'years' and isinstance(value, dict) and isinstance(old, dict):
            result[key] = {**old, **value}
    return result


def saved_features(root, kind, year):
    doc = read(root/f'api/{kind}/years/{year}/index.json')
    rows = list(doc.get('records') or doc.get('images') or [])
    for part in doc.get('parts', []):
        name = safe_relative(str(part.get('path') if isinstance(part, dict) else part).removeprefix('api/'))
        page = read(root/'api'/name)
        rows.extend(page.get('records') or page.get('images') or [])
    return rows


def merge_feature_rows(kind, rows):
    retained = {}
    for row in rows:
        if kind == 'leaders' and row.get('month') and row.get('person') and (row.get('office') or row.get('position')):
            key = ('monthly', row.get('country'), row['month'], row.get('office') or row.get('position'), row.get('person'), row.get('source_page'))
        elif row.get('id'): key = ('id', row['id'])
        else: key = json.dumps(row, sort_keys=True, ensure_ascii=False)
        retained[key] = row
    return list(retained.values())


def copy_file(source, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and digest(source) == digest(target): return
    temp = target.with_name(target.name+'.tmp'); shutil.copyfile(source, temp); temp.replace(target)


def store_object(source, destination, logical):
    """Keep exact original bytes in Git-safe parts, with a reversible logical filename."""
    sha = digest(source); base = destination/'sources/objects'/sha
    base.mkdir(parents=True, exist_ok=True)
    parts = []
    with source.open('rb') as stream:
        while data := stream.read(PART_BYTES):
            path = base/f'part-{len(parts)+1:04d}.bin'
            if not path.exists() or path.read_bytes() != data: path.write_bytes(data)
            parts.append({'path': path.relative_to(destination).as_posix(), 'bytes': len(data),
                          'sha256': hashlib.sha256(data).hexdigest()})
    rows = read(destination/'sources/objects/index.json', {}).get('objects', [])
    rows = [row for row in rows if row.get('logical_path') != logical]
    rows.append({'logical_path': logical, 'sha256': sha, 'bytes': source.stat().st_size, 'parts': parts})
    dump(destination/'sources/objects/index.json', {'schema': 1, 'objects': rows})


def safe_relative(name):
    path = Path(name)
    if path.is_absolute() or not path.parts or any(part in ('.', '..', '.git') for part in path.parts):
        raise ValueError('Unsafe archive path')
    return path


def restore(destination, target):
    for row in read(destination/'sources/objects/index.json', {}).get('objects', []):
        path = target/safe_relative(row['logical_path']); path.parent.mkdir(parents=True, exist_ok=True)
        temp = path.with_name(path.name+'.tmp'); whole = hashlib.sha256(); count = 0
        with temp.open('wb') as output:
            for part in row['parts']:
                block = (destination/safe_relative(part['path'])).read_bytes()
                if len(block) != part['bytes'] or hashlib.sha256(block).hexdigest() != part['sha256']:
                    temp.unlink(missing_ok=True); raise ValueError('Original source part checksum mismatch')
                output.write(block); whole.update(block); count += len(block)
        if count != row['bytes'] or whole.hexdigest() != row['sha256']:
            temp.unlink(missing_ok=True); raise ValueError('Original source checksum mismatch')
        temp.replace(path)


def feature_shards(root, kind, year, rows):
    destination = root/f'api/{kind}/years/{year}'
    destination.mkdir(parents=True, exist_ok=True)
    parts, batch, size = [], [], 0
    def flush():
        nonlocal batch, size
        if not batch: return
        name = f'part-{len(parts)+1:04d}.json'
        dump(destination/name, {'records': batch}); parts.append(f'{kind}/years/{year}/{name}')
        batch, size = [], 0
    for row in dedup(rows):
        length = len(json.dumps(row, ensure_ascii=False).encode())
        if size+length > 480000: flush()
        batch.append(row); size += length
    flush()
    for old in destination.glob('part-*.json'):
        if old.name not in {Path(part).name for part in parts}: old.unlink()
    dump(destination/'index.json', {'schema': 1, 'year': year, 'record_count': len(dedup(rows)), 'parts': parts})


def stage(source, destination, year, caches=()):
    year = checked_year(year); source = source.resolve(); destination = destination.resolve()
    if destination == source or destination.is_relative_to(source): raise ValueError('Archive destination must be outside frontend source')
    destination.mkdir(parents=True, exist_ok=True)
    root = destination/'worldfactbook'
    for folder in ('api', 'media', 'manual', 'boundaries', 'db'):
        base = source/folder
        if not base.exists(): continue
        for path in base.rglob('*'):
            if not path.is_file() or path.is_symlink() or '__pycache__' in path.parts: continue
            relative = path.relative_to(source)
            edition = path_year(relative)
            if relative.parts[:2] == ('manual', 'editions') and len(relative.parts)>2:
                meta = read(source/Path(*relative.parts[:3])/'manifest.json')
                if meta.get('edition_year'):edition = int(meta['edition_year'])
            if edition == year:
                if path.stat().st_size > PART_BYTES: store_object(path, destination, 'worldfactbook/'+relative.as_posix())
                else: copy_file(path, root/relative)
    for name in CATALOGS:
        path = source/'api'/name
        if path.exists():
            doc = read(path)
            if name == 'country-archive/index.json' and doc.get('country_parts'):
                countries = list(doc.get('countries', []))
                for part in doc.pop('country_parts'):
                    relative = safe_relative(str(part.get('path') if isinstance(part, dict) else part).removeprefix('api/'))
                    countries.extend(read(source/'api'/relative).get('countries', []))
                doc['countries'] = countries
            incoming = select_catalog(doc, year)
            dump(root/'api'/name, merge_catalog(read(root/'api'/name), incoming))
    for name in BOUNDARY_CATALOGS:
        doc = read(source/name)
        if doc:
            doc['editions'] = {str(year): doc.get('editions', {})[str(year)]} if str(year) in doc.get('editions', {}) else {}
            previous = read(root/name)
            doc['editions'] = {**previous.get('editions', {}), **doc['editions']}
            dump(root/name, doc)
    # Monthly directories retain every office record. Daily selection uses bounded, explicit officeholder observations.
    leader_rows = saved_features(root, 'leaders', year)+read(root/'api/leaders/index.json').get('records', [])
    normalized=[];replaced_months=set()
    for path in (root/'api/leaders/countries').glob(f'*/{year}/part-*.json'):
        country = path.parents[1].name
        for term in read(path).get('terms', []):
            if int(term.get('parser_version',0))>=2:replaced_months.add((country,term.get('month')))
            if int(term.get('parser_version',0))>=2 and re.search(r'^(?:pres(?:ident|\.)?|prime min(?:ister|\.)?|king|queen|head of state|chancellor|emperor|pope)(?=\W|$)', str(term.get('position', '')), re.I):
                normalized.append({**term, 'country': country, 'office': term.get('position'),
                                    'date_basis': 'monthly source observation'})
    leader_rows=[row for row in leader_rows if not ((row.get('country'),row.get('month')) in replaced_months
                 and row.get('date_basis')=='monthly source observation' and not row.get('source_url'))]+normalized
    feature_shards(root, 'leaders', year, merge_feature_rows('leaders', leader_rows))
    for kind, key in (('images-of-the-day', 'images'), ('facts-of-the-day', 'facts'), ('flags', 'records'),
                      ('places-of-the-day', 'records'), ('legacy-features', 'records')):
        doc = read(root/f'api/{kind}/index.json')
        rows = saved_features(root, kind, year)+list(doc.get('records') or doc.get(key) or [])
        if kind == 'flags':
            for profile in (root/'api/verified-html/countries').glob(f'*/{year}.json'):
                data = read(profile)
                for image in data.get('media', []):
                    if image.get('kind') == 'flag':
                        rows.append({'country': data.get('name', data.get('country')), 'edition_year': year,
                                     'source_url': image.get('source_url') or data.get('source', {}).get('url') or 'https://www.cia.gov/the-world-factbook/',
                                     'source':data.get('source'), 'edition_citation':image.get('locator'), 'asset': image})
        feature_shards(root, kind, year, merge_feature_rows(kind, rows))
    for cache in caches:
        cache = Path(cache)
        if cache.exists() and any(path.is_dir() and path.name.isdigit() for path in cache.iterdir()):
            year_cache = cache/str(year)
            if not year_cache.exists(): continue
        else: year_cache = cache
        for path in year_cache.rglob('*'):
            if path.is_file() and not path.is_symlink() and path.suffix != '.part':
                store_object(path, destination, 'cache/'+str(year)+'/'+path.relative_to(year_cache).as_posix())
    chunks=[]
    for path in (root/f"api/editions/{year}").glob("*.json"):
        rows=read(path).get("chunks", [])
        if isinstance(rows,list):chunks.extend(rows)
    if chunks:
        from shard_store import write_shards
        write_shards(chunks, root/"db")
    return manifest(destination, year)


def manifest(root, year):
    rows = []
    for path in sorted(root.rglob('*')):
        if not path.is_file() or '.git' in path.relative_to(root).parts or path.name == 'archive-manifest.json': continue
        if path.is_symlink(): raise ValueError('Archive symlink forbidden')
        if path.stat().st_size >= 100*1024*1024: raise ValueError('Git object exceeds 100 MiB; store in checksum parts')
        rows.append({'path': path.relative_to(root).as_posix(), 'bytes': path.stat().st_size, 'sha256': digest(path)})
    doc = {'schema': 'zzx-worldfactbook-year-archive-v1', 'year': checked_year(year), 'files': rows,
           'source_policy': 'Original bytes preserved when supplied or acquired; absent originals are not reconstructed.'}
    dump(root/'archive-manifest.json', doc); return doc


def verify(root, year=None):
    doc = read(root/'archive-manifest.json')
    if doc.get('schema') != 'zzx-worldfactbook-year-archive-v1': raise ValueError('Archive manifest missing or unsupported')
    if year is not None and doc.get('year') != checked_year(year): raise ValueError('Archive year identity mismatch')
    expected = set()
    for row in doc['files']:
        relative = safe_relative(row['path']); path = root/relative; expected.add(relative.as_posix())
        if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()) or not path.is_file() or path.stat().st_size != row['bytes'] or digest(path) != row['sha256']:
            raise ValueError('Archive checksum mismatch: '+str(relative))
    actual = {path.relative_to(root).as_posix() for path in root.rglob('*') if path.is_file()
              and '.git' not in path.relative_to(root).parts and path.name != 'archive-manifest.json'}
    if actual != expected: raise ValueError('Archive contains unmanifested or missing files')
    return doc


def catalogs(archives, output, preserve=False, years=None):
    roots = {int(path.name): path for path in archives.iterdir() if path.is_dir() and path.name.isdigit()
             and (path/'archive-manifest.json').exists() and (years is None or int(path.name) in years)}
    for year, path in roots.items(): verify(path, year)
    for name in CATALOGS:
        combined = read(output/'api'/name) if preserve else {}
        for year, path in sorted(roots.items()):
            doc = read(path/'worldfactbook/api'/name)
            if not doc: continue
            for key, value in doc.items():
                if key in ('records', 'facts', 'images') and name not in ('portal-index.json',):
                    combined[key] = []; continue
                if key == 'countries' and isinstance(value, dict):
                    target = combined.setdefault(key, {})
                    for code in list(target): target[code] = [r for r in target[code] if row_year(r) != year]
                    for code, rows in value.items(): target[code] = dedup(target.get(code, [])+rows)
                elif key == 'countries' and isinstance(value,list):
                    previous={row['code']:row for row in combined.get(key,[])}
                    for row in value:
                        old=previous.get(row['code'],{})
                        entries=[entry for entry in old.get('years',[]) if row_year(entry)!=year]+row.get('years',[])
                        previous[row['code']]={**old,**row,'years':sorted(dedup(entries),key=lambda entry:entry['year'])}
                    combined[key]=list(previous.values())
                elif isinstance(value, list):
                    previous = combined.get(key, [])
                    if key == 'months' and value and isinstance(value[0], str):
                        combined[key] = sorted(set([v for v in previous if str(year) not in v]+value))
                    elif all(isinstance(row, dict) for row in value):
                        combined[key] = dedup([r for r in previous if row_year(r) != year]+value)
                    else: combined[key] = value
                elif key != 'record_count': combined[key] = value
            kind = name.split('/')[0]
            shard = path/f'worldfactbook/api/{kind}/years/{year}/index.json'
            if shard.exists():
                combined.setdefault('years', {})[str(year)] = {'path': f'{kind}/years/{year}/index.json',
                    'record_count': read(shard).get('record_count', 0)}
        if combined:
            if isinstance(combined.get('years'),dict): combined['record_count'] = sum(p.get('record_count',0) for p in combined['years'].values())
            if name == 'daily-archive/index.json':
                dates = sorted(row['date'] for row in combined.get('days', [])); combined['coverage'] = {
                    'observed_days': len(dates), 'first_observed_date': dates[0] if dates else None,
                    'latest_observed_date': dates[-1] if dates else None, 'complete_historical_run': False}
                combined['gaps'] = ((datetime.fromisoformat(dates[-1])-datetime.fromisoformat(dates[0])).days+1-len(dates)) if dates else None
            dump(output/'api'/name, combined)
    for name in BOUNDARY_CATALOGS:
        combined = read(output/name) if preserve else {}
        for year, path in sorted(roots.items()):
            doc = read(path/'worldfactbook'/name)
            if doc:
                combined = {**combined, **doc, 'editions': {**combined.get('editions', {}), **doc.get('editions', {})}}
        if combined: dump(output/name, combined)
    previous = read(output/'api/year-archives.json').get('years', []) if preserve else []
    dump(output/'api/year-archives.json', {'schema': 1, 'years': sorted(set(previous)|set(roots)),
        'storage': 'private yearly archives; browser reads the configured readout service'})


def repository(year, owner, template=None, mapping=None):
    year = checked_year(year); settings = read(mapping or HERE/'year-repositories.json')
    slug = settings.get('years', {}).get(str(year)) or (template or settings.get('repository_template') or '{owner}/zzx-worldfactbook-{year}').format(owner=owner, year=year)
    if not SLUG.fullmatch(slug) or '..' in slug: raise ValueError('Repository must be a plain owner/name slug')
    return slug


@contextmanager
def git_auth(token):
    if not token: raise ValueError('Private archive token is missing')
    with tempfile.TemporaryDirectory(prefix='wfb-auth-') as temp:
        helper = Path(temp)/'askpass.py'
        helper.write_text('#!/usr/bin/env python3\nimport os,sys\nprint("x-access-token" if "username" in sys.argv[1].lower() else os.environ["WFB_GIT_TOKEN"])\n')
        helper.chmod(0o700)
        yield {**os.environ, 'GIT_ASKPASS': str(helper), 'GIT_TERMINAL_PROMPT': '0', 'WFB_GIT_TOKEN': token}


def git(*args, cwd=None, env=None):
    return subprocess.run(['git', *map(str,args)], cwd=cwd, env=env, check=True, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, text=True).stdout.strip()


def checkout(root, slug, token, write=False):
    if write: meta = ensure(slug, token); branch = meta['default_branch']
    else:
        status, data = api_request('GET', '/repos/'+slug, token)
        if status != 200 or data.get('private') is not True or str(data.get('full_name','')).lower() != slug.lower():
            raise ValueError('Cannot verify the requested private yearly repository')
        branch = data.get('default_branch', '')
        if not valid_branch(branch): raise ValueError('Invalid archive default branch')
    root.parent.mkdir(parents=True, exist_ok=True)
    with git_auth(token) as env:
        if not (root/'.git').exists(): git('clone', '--branch', branch, 'https://github.com/'+slug+'.git', root, env=env)
        else:
            origin = git('remote','get-url','origin',cwd=root)
            if origin != 'https://github.com/'+slug+'.git': raise ValueError('Archive checkout has a different origin')
            if git('status','--porcelain',cwd=root): raise ValueError('Archive checkout has uncommitted changes')
            git('fetch','origin',branch,cwd=root,env=env);git('merge','--ff-only','origin/'+branch,cwd=root)
    return branch


def run(args):
    token = os.environ.get('PRIVATE_TOKEN','')
    if not token: raise ValueError('WORLDFACTBOOK_PRIVATE_DATA_TOKEN is required before crawling')
    year = checked_year(args.year); root = args.archive_root/str(year)
    slug = repository(year,args.owner,args.template,args.mapping); branch = checkout(root,slug,token,True)
    stage(args.repo_root/'worldfactbook', root, year, args.cache)
    with tempfile.TemporaryDirectory(prefix=f'wfb-{year}-') as temp:
        work = Path(temp); shutil.copytree(args.repo_root/'tools', work/'tools')
        shutil.copytree(root/'worldfactbook', work/'worldfactbook', dirs_exist_ok=True)
        for name in ('country-points.json',):
            path = args.repo_root/'worldfactbook'/name
            if path.exists(): copy_file(path, work/'worldfactbook'/name)
        restore(root, work)
        registry = work/'tools/worldfactbook/data/factbook-countries.json'
        def call(script,*options):
            subprocess.run([sys.executable, str(work/'tools/worldfactbook'/script),*map(str,options)],check=True,cwd=work)
        # Rebuild monthly assignments from their original PDFs/RARs before accepting daily observations.
        import import_leader_rar as monthly
        inputs=[]
        for folder in (work/'cache'/str(year),work/'worldfactbook/manual'):
            for path in folder.rglob('*'):
                if not path.is_file():continue
                if path.suffix.lower()=='.pdf' and re.search(r'ChiefsDirectory',path.name,re.I):inputs.append(path)
                elif path.suffix.lower()=='.rar':
                    try:
                        if any(re.search(r'ChiefsDirectory\.pdf$',name,re.I) for name,_ in monthly.rar_members(path)):inputs.append(path)
                    except (ValueError,RuntimeError):pass
        if inputs:monthly.build(inputs,work/'worldfactbook')
        if args.kind in ('all','corpus','media','manual'):
            call('worldfactbook_crawler.py','--repo-root',work,'--country-registry',registry,
                 '--start-year',year,'--end-year',year,'--mode','refresh','--cache-dir','cache',
                 '--media-mode','full' if args.kind in ('all','media','manual') else 'none')
            # HTML ZIPs become structured profiles only after the edition identity check in the importer.
            import import_local_html_archive as html_import
            for path in (work/'cache'/str(year)).rglob('*.zip'):
                try:
                    row = html_import.import_zip(path,work/'worldfactbook',{
                        html_import.norm(p['name']):p for p in read(work/'worldfactbook/country-points.json').get('points',[])})
                    if row['edition_year'] != year: raise ValueError('HTML ZIP year mismatch')
                    old=read(work/'worldfactbook/api/verified-html/index.json')
                    old['schema']='zzx-html-edition-index-v1';old.setdefault('editions',[])
                    old['editions']=[r for r in old['editions'] if r['edition_year']!=year]+[{k:v for k,v in row.items() if k!='countries'}]
                    for country in row['countries']: old.setdefault('countries',{}).setdefault(country['code'],[]).append(country)
                    dump(work/'worldfactbook/api/verified-html/index.json',old)
                except (ValueError, KeyError, __import__('zipfile').BadZipFile) as error:
                    print(f'HTML structured import skipped: {path.name}: {error}',file=sys.stderr)
            books=[path for folder in (work/'cache'/str(year),work/'worldfactbook/manual') for path in folder.rglob('*')
                   if path.is_file() and path.suffix.lower() in ('.txt','.pdf','.epub') and not re.search(r'ChiefsDirectory',path.name,re.I)]
            if books:
                database=work/'private/structured.sqlite';database.parent.mkdir(parents=True,exist_ok=True)
                call('local_ingest.py','--db',database,'--output',work/'worldfactbook','--registry',registry,
                     'import','--edition-year',year,*books)
                call('local_ingest.py','--db',database,'--output',work/'worldfactbook','--registry',registry,'export')
                store_object(database,root,'private/structured.sqlite')
            call('global_power_grid_sync.py','--country-registry',registry,'--corpus-root',work/'worldfactbook/api/editions',
                 '--electricity-output',work/'worldfactbook/api/electricity-history.json',
                 '--reference-output',work/'worldfactbook/api/reference-index.json','--start-year',year,'--end-year',year)
        if args.kind in ('all','legacy') and year >= 1996:
            call('legacy_features.py','--repo-root',work,'--country-registry',registry,
                 '--start-year',year,'--end-year',year,'--max-homepage-captures',args.max_captures,
                 '--max-leader-captures',args.max_captures,'--max-feature-pages',args.max_captures,
                 '--evidence-root',root/'sources/web')
        if args.kind in ('all','legacy','media') and 2023 <= year <= 2026:
            call('recover_wayback_flags.py','--output',root/'sources/flag-captures',
                 '--start-year',year,'--end-year',year,'--max-captures',args.max_captures)
        if args.kind in ('all','daily') and 1994 <= year <= 2026:
            store=root/'sources/daily-recovery'; api=work/'worldfactbook/api/daily-archive'
            call('recover_daily_facts.py','--store',store,'bootstrap','--api',api)
            call('recover_daily_facts.py','--store',store,'recover','--first-year',year,'--final-year',year,'--max-captures',args.max_captures)
            call('recover_daily_facts.py','--store',store,'export','--api',api)
        stage(work/'worldfactbook',root,year,[work/'cache'])
        for name in ('electricity-history.json','reference-index.json'):
            path=work/'worldfactbook/api'/name
            if path.exists():copy_file(path,root/'worldfactbook/api'/name)
        # Preserve the year-specific SQL corpus in the same private archive.
        if (work/'worldfactbook/db').exists():shutil.copytree(work/'worldfactbook/db',root/'worldfactbook/db',dirs_exist_ok=True)
    manifest(root,year);verify(root,year)
    git('config','user.name','zzx-worldfactbook-bot',cwd=root);git('config','user.email','actions@github.com',cwd=root)
    git('add','worldfactbook','sources','archive-manifest.json',cwd=root)
    if git('diff','--cached','--name-only',cwd=root):
        git('commit','-m',f'Preserve World Factbook {year} sources and derived readouts',cwd=root)
        with git_auth(token) as env:git('push','origin','HEAD:'+branch,cwd=root,env=env)
    catalogs(args.archive_root,args.repo_root/'worldfactbook',True)


def main():
    parser=argparse.ArgumentParser(description=__doc__);sub=parser.add_subparsers(dest='command',required=True)
    for command in ('stage','verify','restore','catalogs','run','mirror'):
        p=sub.add_parser(command)
        if command in ('stage','run'):p.add_argument('--year',type=int,required=True)
        if command=='stage':
            p.add_argument('--source',type=Path,required=True);p.add_argument('--destination',type=Path,required=True);p.add_argument('--cache',type=Path,action='append',default=[])
        elif command in ('verify','restore'):
            p.add_argument('--archive',type=Path,required=True)
            if command=='verify':p.add_argument('--year',type=int)
            else:p.add_argument('--destination',type=Path,required=True)
        elif command=='catalogs':
            p.add_argument('--archive-root',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--preserve',action='store_true')
        else:
            p.add_argument('--owner',required=True);p.add_argument('--template');p.add_argument('--mapping',type=Path)
            p.add_argument('--archive-root',type=Path,required=True)
            if command=='run':
                p.add_argument('--repo-root',type=Path,default=Path('.'));p.add_argument('--kind',choices=('all','corpus','media','legacy','daily','manual'),default='all')
                p.add_argument('--max-captures',type=int,default=60);p.add_argument('--cache',type=Path,action='append',default=[])
            else:p.add_argument('--years',nargs='+',type=int,required=True)
    args=parser.parse_args()
    if args.command=='stage':stage(args.source,args.destination,args.year,args.cache)
    elif args.command=='verify':print(json.dumps({'year':verify(args.archive,args.year)['year'],'status':'verified'}))
    elif args.command=='restore':restore(args.archive,args.destination)
    elif args.command=='catalogs':catalogs(args.archive_root,args.output,args.preserve)
    elif args.command=='run':run(args)
    else:
        for year in args.years:
            root=args.archive_root/str(checked_year(year));checkout(root,repository(year,args.owner,args.template,args.mapping),os.environ.get('PRIVATE_TOKEN',''))
            verify(root,year)
    return 0

if __name__=='__main__':
    try:sys.exit(main())
    except (ValueError, subprocess.CalledProcessError) as error:
        # Git stderr may contain remote implementation details; credentials are never printed.
        print('Year archive operation failed: '+(str(error) if isinstance(error,ValueError) else 'Git command failed'),file=sys.stderr);sys.exit(1)

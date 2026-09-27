#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path
import sys
from typing import Iterable

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import factbook_archive_sync as archive

SCHEMA = archive.SCHEMA
INDEX_SCHEMA = archive.INDEX_SCHEMA
PARSER_VERSION = max(3, archive.PARSER_VERSION)


def utcnow() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00', 'Z')


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    tmp.replace(path)


def score_record(row: dict[str, object]) -> tuple[float, int]:
    # Prefer richer rows. For equal richness, prefer corpus-derived records over
    # the old archive compatibility crawler because the corpus is the canonical
    # source produced by the edition crawler.
    base = archive.score_record(row)
    basis = str((row.get('quality') or {}).get('country_basis') or '')
    local = 1 if basis in {'crawler-entity-code', 'crawler-book-section', 'manual-verified'} else 0
    return (base, local)


def merge_records(existing: Iterable[dict[str, object]], new: Iterable[dict[str, object]]) -> list[dict[str, object]]:
    by_key: dict[tuple[str, int], dict[str, object]] = {}
    for row in [*existing, *new]:
        quality = row.get('quality') or {}
        if str(quality.get('status') or '').lower() != 'verified':
            continue
        try:
            key = (str(row['country']).upper(), int(row.get('edition_year') or row['year']))
        except Exception:
            continue
        previous = by_key.get(key)
        if previous is None or score_record(row) >= score_record(previous):
            by_key[key] = row
    return sorted(by_key.values(), key=lambda row: (int(row.get('edition_year') or row['year']), str(row['country'])))


def source_from_chunk(chunk: dict[str, object], edition_meta: dict[str, object]) -> dict[str, object]:
    return {
        'provider': chunk.get('source_provider') or 'worldfactbook-corpus',
        'source_url': chunk.get('source_url') or '',
        'identifier': chunk.get('source_identifier') or f"edition-{edition_meta.get('edition_year')}",
        'source_file': chunk.get('source_identifier') or '',
        'title': edition_meta.get('edition_label') or str(edition_meta.get('edition_year') or ''),
    }


def record_for_country(country: archive.Country, year: int, chunks: list[dict[str, object]], edition_meta: dict[str, object]) -> dict[str, object] | None:
    # Keep only text likely to contain electricity/power data, but join all such
    # chunks for the country so fields split across category chunks can still be
    # reconstructed as one record.
    useful: list[dict[str, object]] = []
    for chunk in chunks:
        text = str(chunk.get('content') or '')
        lower = text.lower()
        if 'electric' in lower or 'installed generating capacity' in lower or 'generation sources' in lower:
            useful.append(chunk)
    if not useful:
        return None

    text = '\n'.join(str(chunk.get('content') or '') for chunk in useful)
    source = source_from_chunk(useful[0], edition_meta)
    record = archive.record_from_section(country, year, text, source, 'crawler-entity-code')
    if not record:
        return None
    record['source'] = 'ZZX World Factbook normalized corpus'
    record['source_provider'] = source['provider']
    record['quality'] = {
        'status': 'verified',
        'parser_version': PARSER_VERSION,
        'country_basis': 'crawler-entity-code',
        'field_basis': 'explicit-electricity-label',
    }
    return record


def records_from_raw_book(resolver: archive.Resolver, year: int, raw_chunks: list[dict[str, object]], edition_meta: dict[str, object]) -> list[dict[str, object]]:
    if not raw_chunks:
        return []
    text = '\n'.join(str(chunk.get('content') or '') for chunk in raw_chunks)
    if 'electric' not in text.lower():
        return []
    source = source_from_chunk(raw_chunks[0], edition_meta)
    records, _pages = archive.parse_book(resolver, year, f'editions/{year}/raw.json', text, source)
    for row in records:
        row['source'] = 'ZZX World Factbook normalized corpus'
        row['quality'] = {
            'status': 'verified',
            'parser_version': PARSER_VERSION,
            'country_basis': 'crawler-book-section',
            'field_basis': 'explicit-electricity-label',
        }
    return records


def extract_edition(edition_dir: Path, resolver: archive.Resolver) -> tuple[list[dict[str, object]], dict[str, object]]:
    index_path = edition_dir / 'index.json'
    meta = load_json(index_path, {})
    year = int(meta.get('edition_year') or edition_dir.name)
    status = str(meta.get('status') or 'missing')
    if status != 'available':
        return [], {
            'year': year,
            'status': status,
            'reason': meta.get('availability_reason') or 'source-missing',
            'records': 0,
            'countries': 0,
        }

    by_code = {country.code: country for country in resolver.countries}
    grouped: dict[str, list[dict[str, object]]] = {}
    raw_chunks: list[dict[str, object]] = []

    for path in sorted(edition_dir.glob('*.json')):
        if path.name == 'index.json':
            continue
        payload = load_json(path, {})
        for chunk in payload.get('chunks') or []:
            if not isinstance(chunk, dict):
                continue
            code = str(chunk.get('entity_code') or '').upper()
            name = str(chunk.get('entity_name') or '')
            if not code and name:
                resolved = resolver.resolve_name(name)
                code = resolved.code if resolved else ''
            if code in by_code:
                grouped.setdefault(code, []).append(chunk)
            elif path.name == 'raw.json':
                raw_chunks.append(chunk)

    records: list[dict[str, object]] = []
    for code, chunks in grouped.items():
        record = record_for_country(by_code[code], year, chunks, meta)
        if record:
            records.append(record)

    if len(records) < 5:
        records = merge_records(records, records_from_raw_book(resolver, year, raw_chunks, meta))

    return merge_records([], records), {
        'year': year,
        'status': 'available',
        'edition_label': meta.get('edition_label') or str(year),
        'records': len(records),
        'countries': len({row['country'] for row in records}),
        'sources': meta.get('sources') or [],
    }


def build_reference_index(coverage: list[dict[str, object]], records: list[dict[str, object]], start_year: int, end_year: int) -> dict[str, object]:
    records_by_year: dict[int, list[dict[str, object]]] = {}
    for row in records:
        records_by_year.setdefault(int(row['edition_year']), []).append(row)

    editions = []
    pages = []
    for row in coverage:
        year = int(row['year'])
        sources = row.get('sources') or []
        if row.get('status') == 'available':
            editions.append({
                'edition_year': year,
                'edition_label': row.get('edition_label') or str(year),
                'provider': 'worldfactbook-corpus',
                'identifier': f'worldfactbook-corpus-{year}',
                'item_url': f'/worldfactbook/api/editions/{year}/index.json',
                'artifact_url': f'/worldfactbook/api/editions/{year}/index.json',
                'file': f'editions/{year}/index.json',
                'electricity_records': len(records_by_year.get(year, [])),
                'parser_version': PARSER_VERSION,
                'sources': sources,
                'retrieved_at': utcnow(),
            })
        for record in records_by_year.get(year, []):
            pages.append({
                'edition_year': year,
                'country': record.get('country'),
                'country_name': record.get('country_name'),
                'source_entity': record.get('country_name'),
                'country_basis': (record.get('quality') or {}).get('country_basis'),
                'provider': record.get('source_provider') or 'worldfactbook-corpus',
                'item_identifier': record.get('source_identifier') or f'worldfactbook-corpus-{year}',
                'item_url': record.get('source_url') or f'/worldfactbook/api/editions/{year}/index.json',
                'container_url': record.get('source_url') or f'/worldfactbook/api/editions/{year}/index.json',
                'inner_path': f'editions/{year}',
                'source_url': record.get('source_url') or f'/worldfactbook/api/editions/{year}/index.json',
                'capture_timestamp': None,
            })

    return {
        'schema': INDEX_SCHEMA,
        'generated_at': utcnow(),
        'scan_start_year': start_year,
        'scan_end_year': end_year,
        'source': 'ZZX World Factbook normalized corpus',
        'editions': editions,
        'pages': pages,
        'coverage': [{k: v for k, v in row.items() if k != 'sources'} for row in coverage],
    }


def sync(args: argparse.Namespace) -> dict[str, object]:
    registry = load_json(args.country_registry, {'countries': []})
    resolver = archive.Resolver(registry)

    existing = load_json(args.electricity_output, {'schema': SCHEMA, 'records': []})
    existing_records = list(existing.get('records') or []) if args.preserve_existing else []

    coverage: list[dict[str, object]] = []
    corpus_records: list[dict[str, object]] = []

    for year in range(args.start_year, args.end_year + 1):
        edition_dir = args.corpus_root / str(year)
        if not edition_dir.exists():
            coverage.append({'year': year, 'status': 'missing', 'reason': 'edition-directory-missing', 'records': 0, 'countries': 0})
            continue
        records, state = extract_edition(edition_dir, resolver)
        corpus_records.extend(records)
        coverage.append(state)

    records = merge_records(existing_records, corpus_records)
    years = [int(row['edition_year']) for row in records]
    available_years = [int(row['year']) for row in coverage if row.get('status') == 'available']
    missing_years = [int(row['year']) for row in coverage if row.get('status') != 'available']
    corpus_years_with_power = sorted({int(row['edition_year']) for row in corpus_records})

    ledger = {
        'schema': SCHEMA,
        'source': 'ZZX World Factbook normalized corpus + preserved verified archive records',
        'generated_at': utcnow(),
        'scan_start_year': args.start_year,
        'scan_end_year': args.end_year,
        'quality_policy': 'Only explicit electricity fields with strong country attribution are published.',
        'record_count': len(records),
        'country_count': len({row['country'] for row in records}),
        'earliest_edition': min(years) if years else None,
        'latest_edition': max(years) if years else None,
        'corpus_available_years': available_years,
        'corpus_missing_years': missing_years,
        'corpus_power_years': corpus_years_with_power,
        'records': records,
    }
    reference = build_reference_index(coverage, records, args.start_year, args.end_year)

    for path in [args.electricity_output, args.power_grid_output, args.widget_output]:
        if path:
            write_json(path, ledger)
    write_json(args.reference_output, reference)

    return {
        'schema': 'zzx-worldfactbook-global-power-grid-sync-v1',
        'start_year': args.start_year,
        'end_year': args.end_year,
        'available_editions': len(available_years),
        'missing_editions': missing_years,
        'corpus_power_years': corpus_years_with_power,
        'records_from_corpus': len(corpus_records),
        'records_total': len(records),
        'countries_total': len({row['country'] for row in records}),
        'latest_edition': max(years) if years else None,
    }


def self_test() -> None:
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        editions = root / 'editions' / '2025'
        editions.mkdir(parents=True)
        registry = {
            'countries': [
                {'country': 'US', 'countryName': 'United States', 'officialName': 'United States of America'}
            ]
        }
        write_json(root / 'countries.json', registry)
        write_json(editions / 'index.json', {
            'schema': 'zzx-worldfactbook-edition-v1',
            'edition_year': 2025,
            'edition_label': '2025',
            'status': 'available',
            'sources': [],
        })
        write_json(editions / 'energy.json', {
            'schema': 'zzx-worldfactbook-category-v1',
            'edition_year': 2025,
            'category': 'energy',
            'chunks': [{
                'entity_code': 'US',
                'entity_name': 'United States',
                'content': 'Electricity—production: 4.25 trillion kWh (2024 est.)\nElectricity—consumption: 4.00 trillion kWh (2024 est.)\nElectricity—installed generating capacity: 1.30 billion kW (2024 est.)',
                'source_provider': 'manual-book',
                'source_identifier': 'test-2025',
                'source_url': 'manual://2025/test',
            }],
        })
        out = root / 'electricity.json'
        args = argparse.Namespace(
            country_registry=root / 'countries.json',
            corpus_root=root / 'editions',
            electricity_output=out,
            reference_output=root / 'reference.json',
            power_grid_output=root / 'power.json',
            widget_output=root / 'widget.json',
            start_year=2025,
            end_year=2025,
            preserve_existing=False,
        )
        report = sync(args)
        payload = load_json(out, {})
        assert report['records_from_corpus'] == 1, report
        assert payload['latest_edition'] == 2025, payload
        record = payload['records'][0]
        assert record['country'] == 'US'
        assert record['electricity_generation_kwh'] == 4.25e12
        assert (record['quality'] or {}).get('country_basis') == 'crawler-entity-code'
    print('global_power_grid_sync self-test passed')


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument('--country-registry', type=Path, required=True)
    parser.add_argument('--corpus-root', type=Path, required=True)
    parser.add_argument('--electricity-output', type=Path, required=True)
    parser.add_argument('--reference-output', type=Path, required=True)
    parser.add_argument('--power-grid-output', type=Path)
    parser.add_argument('--widget-output', type=Path)
    parser.add_argument('--start-year', type=int, default=1962)
    parser.add_argument('--end-year', type=int, default=2027)
    parser.add_argument('--preserve-existing', action='store_true', default=True)
    parser.add_argument('--no-preserve-existing', action='store_false', dest='preserve_existing')
    parser.add_argument('--self-test', action='store_true')
    return parser


def main() -> int:
    if '--self-test' in sys.argv[1:]:
        self_test()
        return 0
    args = build_parser().parse_args()
    if args.start_year > args.end_year:
        raise SystemExit('start year must be <= end year')
    print(json.dumps(sync(args), indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

from __future__ import annotations
import hashlib
from http.server import ThreadingHTTPServer
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import urlopen

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools/worldfactbook'))
import year_archive as archive
import archive_server as server
import worldfactbook_crawler as crawler
import publish_archive_indexes as publisher
import legacy_features as legacy

class YearArchiveTests(unittest.TestCase):
    def fixture(self,root,year=2007):
        w=root/'site';w.mkdir(parents=True,exist_ok=True)
        archive.dump(w/f'api/verified-html/countries/US/{year}.json',{'country':'US','year':year,'fields':[{'label':'Population','content':'301139947'}]})
        archive.dump(w/'api/verified-html/index.json',{'schema':1,'editions':[{'edition_year':year}], 'countries':{'US':[{'year':year,'path':f'api/verified-html/countries/US/{year}.json'}]}})
        archive.dump(w/'api/portal-index.json',{'editions':[{'year':year},{'year':year-1}]})
        return w
    def test_stage_isolates_year_and_manifest_detects_tamper(self):
        with tempfile.TemporaryDirectory() as t:
            base=Path(t);w=self.fixture(base)
            archive.dump(w/'api/verified-html/countries/US/2006.json',{'country':'US','year':2006})
            root=base/'years/2007';archive.stage(w,root,2007)
            self.assertTrue((root/'worldfactbook/api/verified-html/countries/US/2007.json').exists())
            self.assertFalse((root/'worldfactbook/api/verified-html/countries/US/2006.json').exists())
            self.assertEqual(archive.read(root/'worldfactbook/api/portal-index.json')['editions'],[{'year':2007}])
            archive.verify(root,2007)
            with self.assertRaisesRegex(ValueError,'identity'):archive.verify(root,2006)
            (root/'worldfactbook/api/portal-index.json').write_text('{}')
            with self.assertRaisesRegex(ValueError,'checksum'):archive.verify(root)
    def test_sparse_indexes_preserve_private_features_and_monthly_updates(self):
        with tempfile.TemporaryDirectory() as t:
            base=Path(t);w=self.fixture(base)
            archive.dump(w/'api/facts-of-the-day/index.json',{'records':[{'year':2007,'id':'fact','body':'captured source text'}]})
            archive.dump(w/'api/source-index.json',{'sources':[{'year':2007,'name':'one.pdf'},{'year':2007,'name':'two.pdf'}]})
            terms=w/'api/leaders/countries/US/2007/part-0001.json'
            archive.dump(terms,{'terms':[{'country':'US','month':'2007-07','person':'first observation','position':'Pres.','parser_version':2}]})
            root=base/'year';archive.stage(w,root,2007)
            first=archive.digest(root/'archive-manifest.json');archive.stage(w,root,2007)
            self.assertEqual(archive.digest(root/'archive-manifest.json'),first)
            archive.dump(w/'api/facts-of-the-day/index.json',{'records':[],'years':{'2007':{'path':'facts-of-the-day/years/2007/index.json'}}})
            archive.dump(w/'api/source-index.json',{'sources':[]})
            archive.dump(terms,{'terms':[{'country':'US','month':'2007-07','person':'updated observation','position':'Pres.','parser_version':2}]})
            archive.stage(w,root,2007);archive.verify(root,2007)
            self.assertEqual(archive.saved_features(root/'worldfactbook','facts-of-the-day',2007)[0]['body'],'captured source text')
            self.assertEqual(len(archive.read(root/'worldfactbook/api/source-index.json')['sources']),2)
            leaders=archive.saved_features(root/'worldfactbook','leaders',2007)
            self.assertEqual([row['person'] for row in leaders],['updated observation'])
    def test_service_disables_a_failed_year_and_keeps_valid_years(self):
        with tempfile.TemporaryDirectory() as t:
            base=Path(t);years=base/'years'
            for year in (2005,2007):archive.stage(self.fixture(base/str(year),year),years/str(year),year)
            indexes=base/'indexes';archive.catalogs(years,indexes);store=server.Store(years,indexes)
            route='/worldfactbook-data/years/2007/worldfactbook/api/verified-html/countries/US/2007.json'
            self.assertIsNotNone(store.resolve(route))
            (years/'2007/worldfactbook/api/verified-html/countries/US/2007.json').write_text('{}')
            store.refresh();self.assertEqual(store.verified_years,{2005});self.assertIsNone(store.resolve(route))
            archive.catalogs(years,indexes,years=store.verified_years)
            self.assertEqual(archive.read(indexes/'api/year-archives.json')['years'],[2005])
    def test_stage_rebuilds_sql_when_index_chunk_count_is_an_integer(self):
        with tempfile.TemporaryDirectory() as t:
            base=Path(t);w=self.fixture(base)
            archive.dump(w/'api/editions/2007/index.json',{'chunks':1})
            archive.dump(w/'api/editions/2007/geography.json',{'chunks':[{'id':'fixture','edition_year':2007,'entity_code':'US','category':'geography','text':'fixture content'}]})
            archive.stage(w,base/'year',2007)
            self.assertTrue((base/'year/worldfactbook/db/manifest.json').exists())

    def test_partitioned_country_catalog_and_historical_boundary_discovery(self):
        with tempfile.TemporaryDirectory() as t:
            base=Path(t);w=self.fixture(base)
            archive.dump(w/'api/country-archive/index.json',{'countries':[],'country_parts':[{'path':'api/country-archive/countries-part-0001.json'}]})
            archive.dump(w/'api/country-archive/countries-part-0001.json',{'countries':[{'code':'US','name':'United States','years':[{'year':2006},{'year':2007}]}]})
            archive.dump(w/'boundaries/manifest.json',{'schema':1,'reference':'reference/index.json','editions':{'2007':'editions/2007/index.json','2006':'editions/2006/index.json'}})
            archive.dump(w/'boundaries/editions/2007/index.json',{'year':2007,'kind':'historical'})
            years=base/'years';archive.stage(w,years/'2007',2007)
            index=archive.read(years/'2007/worldfactbook/api/country-archive/index.json')
            self.assertNotIn('country_parts',index);self.assertEqual(index['countries'][0]['years'],[{'year':2007}])
            indexes=base/'indexes';archive.catalogs(years,indexes);store=server.Store(years,indexes)
            route='/worldfactbook-data/indexes/worldfactbook/boundaries/manifest.json'
            self.assertEqual(archive.read(store.resolve(route))['editions'],{'2007':'editions/2007/index.json'})
            self.assertIsNotNone(store.resolve('/worldfactbook-data/years/2007/worldfactbook/boundaries/editions/2007/index.json'))

    def test_manual_combined_year_label_uses_manifest_year(self):
        with tempfile.TemporaryDirectory() as t:
            base=Path(t);w=self.fixture(base)
            archive.dump(w/'manual/editions/2025-2026/manifest.json',{'edition_year':2026})
            original=w/'manual/editions/2025-2026/sources/book.txt';original.parent.mkdir(parents=True);original.write_text('supplied print transcription')
            archive.stage(w,base/'2026',2026);archive.stage(w,base/'2025',2025)
            self.assertTrue((base/'2026/worldfactbook/manual/editions/2025-2026/sources/book.txt').exists())
            self.assertFalse((base/'2025/worldfactbook/manual/editions/2025-2026/sources/book.txt').exists())
    def test_failed_source_refresh_retains_other_sources_in_the_same_year(self):
        source={'edition_year':2007,'source_provider':'archive','source_identifier':'edition'}
        old=[{**source,'source_url':'https://example.invalid/a','content':'old a'},
             {**source,'source_url':'https://example.invalid/b','content':'retained b'}]
        current=[{**source,'source_url':'https://example.invalid/a','content':'updated a'}]
        rows=crawler.retain_unrefreshed_chunks(current,old)
        self.assertEqual([row['content'] for row in rows],['updated a','retained b'])
        self.assertTrue(archive.valid_branch('archive/main'))
        self.assertFalse(archive.valid_branch('main/../other'))

    def test_archived_leader_pdf_uses_printed_month_and_keeps_every_office(self):
        import fitz
        with tempfile.TemporaryDirectory() as t:
            world=Path(t)
            points=[{'code':f'C{i:02d}','name':f'Example Country {i:02d}'} for i in range(80)]
            archive.dump(world/'country-points.json',{'points':points})
            with fitz.open() as pdf:
                pdf.new_page().insert_text((50,50),'DI CS 2012-01')
                pdf.new_page();pdf.new_page()
                for country in points:
                    page=pdf.new_page();page.insert_text((50,50),country['name']+'\n'+'\n'.join(f'Office {i} ........ Example Officeholder {i}' for i in range(8)))
                raw=pdf.tobytes()
            rec={'original':'https://www.cia.gov/example-directory.pdf','snapshot_url':'https://web.archive.org/web/20241001000000id_/https://www.cia.gov/example-directory.pdf','timestamp':'20241001000000'}
            rows=legacy.extract_leader_pdf(raw,rec,world,2012,2012)
            self.assertEqual(len(rows),640);self.assertEqual({row['month'] for row in rows},{'2012-01'})
            self.assertTrue(all(row['start'] is None and row['end'] is None and len(row['source_sha256'])==64 for row in rows))
            self.assertEqual(legacy.extract_leader_pdf(raw,rec,world,2024,2024),[])
    def test_alphabet_heading_does_not_assign_kazakhstan_offices_to_jordan(self):
        import fitz,import_leader_rar as monthly
        with fitz.open() as pdf:
            pdf.new_page().insert_text((50,50),'DI CS 2012-01');pdf.new_page();pdf.new_page()
            pdf.new_page().insert_text((50,50),'Jordan\nPrime Min. .... Example Jordan PM\nK       Kazakhstan\nPrime Min. .... Example Kazakhstan PM\nCuba - NDE\nPres. .... Example Cuba President')
            rows,_=monthly.parse_pdf(pdf.tobytes(),'January2012ChiefsDirectory.pdf',2012,1,{'jordan':('JO','Jordan'),'kazakhstan':('KZ','Kazakhstan'),'cuba':('CU','Cuba')})
        self.assertEqual([row['person'] for row in rows['JO']],['Example Jordan PM'])
        self.assertEqual([row['person'] for row in rows['KZ']],['Example Kazakhstan PM'])
        self.assertEqual([row['person'] for row in rows['CU']],['Example Cuba President'])
        self.assertTrue(all(row['parser_version']==2 for values in rows.values() for row in values))

    def test_legacy_map_crawl_includes_binary_captures(self):
        with patch.object(legacy,'request_json',return_value=[['timestamp','original']]) as request:
            legacy.cdx('www.cia.gov/maps/*',2007,2007,10,mimetype=None)
            self.assertNotIn('mimetype%3Atext%2Fhtml',request.call_args.args[0])
            legacy.cdx('www.cia.gov/*',2007,2007,10)
            self.assertIn('mimetype%3Atext%2Fhtml',request.call_args.args[0])

    def test_split_sources_restore_exact_bytes_and_reject_corruption(self):
        with tempfile.TemporaryDirectory() as t,patch.object(archive,'PART_BYTES',37):
            base=Path(t);source=base/'source.pdf';data=bytes(range(256));source.write_bytes(data)
            archive.store_object(source,base/'private','cache/2007/source.pdf')
            rows=archive.read(base/'private/sources/objects/index.json')['objects']
            self.assertEqual(len(rows[0]['parts']),7)
            archive.restore(base/'private',base/'restored')
            self.assertEqual((base/'restored/cache/2007/source.pdf').read_bytes(),data)
            (base/'private'/rows[0]['parts'][0]['path']).write_bytes(b'bad')
            with self.assertRaisesRegex(ValueError,'checksum'):archive.restore(base/'private',base/'broken')
    def test_catalogs_preserve_other_years_and_update_country_entries(self):
        with tempfile.TemporaryDirectory() as t:
            base=Path(t);years=base/'years'
            for year in (2005,2007):
                w=self.fixture(base/str(year),year)
                archive.dump(w/'api/country-archive/index.json',{'years':[{'year':year}], 'countries':[{'code':'US','name':'United States','years':[{'year':year,'path':f'api/country-archive/countries/US/{year}/index.json'}]}]})
                archive.dump(w/'api/leaders/index.json',{'records':[{'year':year,'country':'US','text':'private evidence'}]})
                archive.stage(w,years/str(year),year)
            output=base/'public';archive.catalogs(years,output)
            doc=archive.read(output/'api/country-archive/index.json')
            self.assertEqual([r['year'] for r in doc['countries'][0]['years']],[2005,2007])
            self.assertEqual(archive.read(output/'api/leaders/index.json')['records'],[])
            single=base/'single';single.mkdir();archive.stage(base/'2007/site',single/'2007',2007)
            archive.catalogs(single,output,True)
            self.assertEqual(len(archive.read(output/'api/verified-html/index.json')['countries']['US']),2)
            self.assertEqual(archive.read(output/'api/year-archives.json')['years'],[2005,2007])
    def test_unmanifested_file_is_rejected(self):
        with tempfile.TemporaryDirectory() as t:
            base=Path(t);archive.stage(self.fixture(base),base/'year',2007)
            (base/'year/extra.txt').write_text('unexpected')
            with self.assertRaisesRegex(ValueError,'unmanifested'):archive.verify(base/'year')
    def test_service_serves_only_readouts_and_cleared_media_with_etag(self):
        with tempfile.TemporaryDirectory() as t:
            base=Path(t);w=self.fixture(base)
            archive.dump(w/'api/media/2007/index.json',{'records':[{'path':'media/2007/flag.png','rights':'public domain'},{'path':'media/2007/pending.png','rights':'pending'}]})
            (w/'media/2007').mkdir(parents=True);(w/'media/2007/flag.png').write_bytes(b'PNG');(w/'media/2007/pending.png').write_bytes(b'pending')
            archives=base/'years';archive.stage(w,archives/'2007',2007)
            indexes=base/'indexes';archive.catalogs(archives,indexes)
            store=server.Store(archives,indexes)
            for path in ['sources/original.pdf','db/part.sql.gz','.git/config','media/2007/pending.png','api/../db/a.json']:
                with self.subTest(path=path):
                    try:result=store.resolve('/worldfactbook-data/years/2007/worldfactbook/'+path)
                    except ValueError:result=None
                    self.assertIsNone(result)
            http=ThreadingHTTPServer(('127.0.0.1',0),server.Handler);http.store=store;http.allowed_origin=''
            thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start()
            prefix=f'http://127.0.0.1:{http.server_port}/worldfactbook-data/'
            try:
                with urlopen(prefix+'years/2007/worldfactbook/api/verified-html/countries/US/2007.json') as response:
                    self.assertEqual(json.load(response)['year'],2007);self.assertTrue(response.headers['ETag'])
                with urlopen(prefix+'years/2007/worldfactbook/media/2007/flag.png') as response:self.assertEqual(response.read(),b'PNG')
                with self.assertRaises(HTTPError) as error:urlopen(prefix+'years/2007/worldfactbook/media/2007/pending.png')
                self.assertEqual(error.exception.code,404)
            finally:http.shutdown();http.server_close();thread.join()
    def test_repository_mapping_and_read_only_token(self):
        with tempfile.TemporaryDirectory() as t:
            mapping=Path(t)/'mapping.json';archive.dump(mapping,{'years':{'2007':'ZZX-Labs/existing-2007'}})
            self.assertEqual(archive.repository(2007,'ZZX-Labs',mapping=mapping),'ZZX-Labs/existing-2007')
            archive.dump(mapping,{'years':{'2007':'https://token@github.com/ZZX-Labs/x'}})
            with self.assertRaises(ValueError):archive.repository(2007,'ZZX-Labs',mapping=mapping)
        with patch.object(archive,'api_request',return_value=(200,{'full_name':'ZZX-Labs/x','private':False,'default_branch':'main'})):
            with self.assertRaisesRegex(ValueError,'private'):archive.checkout(Path('/unused'),'ZZX-Labs/x','token')
    def test_private_git_credentials_never_enter_remote_urls(self):
        with archive.git_auth('fixture-token') as env:
            helper=env['GIT_ASKPASS']
            self.assertNotIn('fixture-token',Path(helper).read_text())
            username=subprocess.check_output([helper,'Username for remote'],env=env,text=True).strip()
            password=subprocess.check_output([helper,'Password for remote'],env=env,text=True).strip()
            self.assertEqual((username,password),('x-access-token','fixture-token'))
        self.assertFalse(Path(helper).exists())
    def test_download_refresh_uses_conditional_request_and_replaces_changed_bytes(self):
        with tempfile.TemporaryDirectory() as t:
            path=Path(t)/'source.txt';requests=[]
            class Response(io.BytesIO):
                headers={'ETag':'"v1"','Last-Modified':'date'}
            def first(req,timeout):requests.append(req);return Response(b'first')
            with patch.object(crawler.urllib.request,'urlopen',first):crawler.download('https://example.invalid/data',path,1024)
            def unchanged(req,timeout):
                requests.append(req);raise HTTPError(req.full_url,304,'Not Modified',{},None)
            with patch.object(crawler.urllib.request,'urlopen',unchanged):crawler.download('https://example.invalid/data',path,1024,refresh=True)
            self.assertEqual(path.read_bytes(),b'first');self.assertEqual(requests[-1].get_header('If-none-match'),'"v1"')
            with patch.object(crawler.urllib.request,'urlopen',lambda req,timeout:Response(b'changed')):
                crawler.download('https://example.invalid/data',path,1024,refresh=True)
            self.assertEqual(path.read_bytes(),b'changed')

if __name__=='__main__':unittest.main()

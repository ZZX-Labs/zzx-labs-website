"""ZZXCyberChef offline regression tests. Standard-library only.

Run from repository root: python -m unittest discover -s cyberchef/tests -v
These tests do not require a browser, network, node/npm, or changes to app/.
"""
import hashlib
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PANE_SET = {'ops', 'recipe', 'input', 'output'}


def read_json(relative):
    return json.loads((ROOT / relative).read_text(encoding='utf-8'))


class CyberChefIntegrity(unittest.TestCase):
    def test_pristine_upstream(self):
        manifest = read_json('runtime-manifest.json')
        app = (ROOT / 'app/index.html').read_bytes()
        digest = hashlib.sha256(app).hexdigest()
        self.assertEqual(digest, manifest['native_frontend']['index_sha256'])
        self.assertEqual(digest, manifest['native_frontend']['upstream_entry_sha256'])
        self.assertEqual((ROOT / 'app/CyberChef_v11.5.0.html').read_bytes(), app)

    def test_css_module_paths(self):
        def check_imports(css_path):
            src = css_path.read_text(encoding='utf-8')
            for path in re.findall(r'@import\s+url\(["\']([^"\']+)', src):
                with self.subTest(import_path=(css_path.name, path)):
                    self.assertTrue((css_path.parent / path).exists())
        for name in ['styles.css', 'upgrades.css', 'modifications.css', 'css/frame/shim.css']:
            check_imports(ROOT / name)

    def test_parent_html_scripts_exist(self):
        html = (ROOT / 'index.html').read_text(encoding='utf-8')
        scripts = re.findall(r'<script\s+src=["\']([^"\']+)', html)
        self.assertGreaterEqual(len(scripts), 18)
        for script in scripts:
            if script.startswith('./'):
                with self.subTest(script=script):
                    self.assertTrue((ROOT / script.split("?", 1)[0]).exists())
        for element_id in ('cz-runtime', 'cz-frame', 'cz-source', 'cz-control-deck'):
            self.assertIn(f'id="{element_id}"', html)

    def test_shell_first_and_observer_safety(self):
        html = (ROOT / 'index.html').read_text(encoding='utf-8')
        downloads = (ROOT / 'js/downloads.js').read_text(encoding='utf-8')
        bootstrap = (ROOT / 'js/bootstrap.js').read_text(encoding='utf-8')
        shell = (ROOT / 'js/shell-first.js').read_text(encoding='utf-8')
        ticker = (ROOT.parent / 'static/js/modules/ticker-loader.js').read_text(encoding='utf-8')
        self.assertLess(html.index('js/shell-first.js'), html.index('../static/script.js'))
        self.assertIn('loading="lazy"', html)
        self.assertIn('zzx:cyberchef-shell-ready', shell)
        for element in ('header/header.html', 'nav/nav.html', 'footer/footer.html'):
            self.assertIn(element, shell)
        self.assertIn('anchor.getAttribute("href") !== official', downloads)
        self.assertIn('node.querySelectorAll?.("a[href],a[download]")', downloads)
        self.assertIn('IntersectionObserver', bootstrap)
        self.assertIn('waitForChrome()', bootstrap)
        self.assertIn('observer.observe(mount, { childList: true, subtree: false })', ticker)
        self.assertNotIn('observer.observe(' + chr(10) + '      D.documentElement,', ticker)

    def test_all_64_themes(self):
        index = read_json('themes/index.json')
        self.assertEqual(len(index['themes']), 64)
        for item in index['themes']:
            with self.subTest(theme=item['id']):
                preset = read_json('themes/' + item['file'])
                self.assertEqual(preset['id'], item['id'])
                self.assertTrue(preset.get('colors', {}).get('background'))

    def test_all_128_layouts_desktop_mobile(self):
        index = read_json('layouts/index.json')
        self.assertEqual(len(index['layouts']), 128)
        ids = set()
        for item in index['layouts']:
            with self.subTest(layout=item['id']):
                self.assertNotIn(item['id'], ids)
                ids.add(item['id'])
                preset = read_json('layouts/' + item['file'])
                self.assertEqual(preset['id'], item['id'])
                if preset.get('native'):
                    continue
                for field in ['workspace', 'mobile']:
                    geometry = preset[field]
                    areas = [row.split() for row in geometry['areas']]
                    self.assertTrue(areas)
                    self.assertTrue(all(len(row) == len(geometry['columns']) for row in areas))
                    self.assertEqual(len(areas), len(geometry['rows']))
                    self.assertEqual({token for row in areas for token in row}, PANE_SET)
                    # CSS grid-template-areas requires each named pane to form
                    # a contiguous rectangle, including responsive variants.
                    for token in PANE_SET:
                        occupied = [(y, x) for y, row in enumerate(areas)
                                    for x, name in enumerate(row) if name == token]
                        yvals, xvals = zip(*occupied)
                        area = (max(yvals) - min(yvals) + 1) * (max(xvals) - min(xvals) + 1)
                        self.assertEqual(len(occupied), area)

    def test_fixed_runtime_and_feedback_regression(self):
        config = (ROOT / 'js/config.js').read_text()
        resize = (ROOT / 'js/resize.js').read_text()
        layouts = (ROOT / 'js/layouts.js').read_text()
        css = (ROOT / 'css/page/mobile.css').read_text()
        runtime = (ROOT / 'js/runtime.js').read_text()
        self.assertIn('runtimeId: "cz-runtime"', config)
        self.assertIn('--cz-runtime-height', resize)
        self.assertIn('var(--cz-runtime-height', css)
        self.assertNotIn('frameResizeObserver', layouts)
        self.assertIn('mutationObserver.observe(content, { childList: true, subtree: false })', layouts)
        self.assertNotIn('await M.Quota.ensureWritable()', runtime)
        self.assertIn('M.Quota.probe()', runtime)
        self.assertIn('CyberChef engine did not initialize', runtime)


if __name__ == '__main__':
    unittest.main()

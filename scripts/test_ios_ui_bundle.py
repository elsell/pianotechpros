import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

class IOSUIBundleTests(unittest.TestCase):
    def check(self, bundle=b'compiled-entry', environment='development', api='http://127.0.0.1:18082', issuer='http://127.0.0.1:18082/oidc'):
        with tempfile.TemporaryDirectory() as directory:
            app=Path(directory)
            if bundle is not None:(app/'main.jsbundle').write_bytes(bundle)
            config=app/'EXConstants.bundle';config.mkdir()
            (config/'app.config').write_text(json.dumps({'extra':{'application':{'environment':environment,'apiURL':api,'oidcIssuer':issuer,'oidcClientId':'pianotechpros-mobile'}}}))
            return subprocess.run([sys.executable,str(Path(__file__).with_name('check-ios-ui-bundle.py')),str(app)],capture_output=True).returncode
    def test_embedded_loopback_app(self):
        self.assertEqual(self.check(),0)
    def test_requires_nonempty_bundle(self):
        for bundle in [None,b'']:
            with self.subTest(bundle=bundle):self.assertNotEqual(self.check(bundle=bundle),0)
    def test_rejects_production_or_foreign_configuration(self):
        for kwargs in [{'environment':'production'},{'api':'https://example.test'},{'issuer':'http://localhost:18082/oidc'}]:
            with self.subTest(kwargs=kwargs):self.assertNotEqual(self.check(**kwargs),0)
if __name__=='__main__':unittest.main()

import copy
import importlib.util
from pathlib import Path
import unittest
import tempfile
import shutil
import subprocess
import json
import os

spec = importlib.util.spec_from_file_location('runtime_vex', Path(__file__).with_name('node-runtime-vex.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class RuntimeVEX(unittest.TestCase):
    def setUp(self):
        self.image = 'sha256:' + 'a' * 64
        self.tag = 'pianotechpros-web:sha256-' + 'a' * 64
        self.runtime = {'node': 'v24.22.2', 'architecture': 'x64', 'hashes': dict(module.HASHES), 'dns': 'NUL rejected', 'tls': 'non-canonical rejected; legitimate identities accepted'}
        self.scan = {'source': {'type': 'image', 'target': {'imageID': self.image, 'architecture': 'amd64', 'tags': [self.tag]}}, 'ignoredMatches': [], 'matches': []}
    def test_exact_image_and_package_scope(self):
        result = module.document(self.scan, self.runtime, self.image, self.tag)
        self.assertEqual({s['vulnerability']['name'] for s in result['statements']}, {'CVE-2026-105482', 'CVE-2026-106069'})
        for statement in result['statements']:
            self.assertEqual(statement['status'], 'fixed')
            self.assertEqual(statement['products'][0]['@id'], self.tag)
            self.assertEqual({p['@id'] for p in statement['products'][0]['subcomponents']}, set(module.PURLS))
            self.assertTrue(all('@' in p and 'hum1?' in p for p in module.PURLS))
    def test_scanner_null_empty_ignored_list_is_accepted(self):
        self.scan['ignoredMatches'] = None
        module.document(self.scan, self.runtime, self.image, self.tag)
        del self.scan['ignoredMatches']
        module.document(self.scan, self.runtime, self.image, self.tag)

    def test_changed_or_missing_runtime_evidence_is_rejected(self):
        changes = [('node','v24.22.3'), ('architecture','arm64'), ('hashes',{}), ('dns','passed'), ('tls','passed')]
        for key,value in changes:
            with self.subTest(key=key):
                bad=copy.deepcopy(self.runtime);bad[key]=value
                with self.assertRaises(ValueError):module.document(self.scan,bad,self.image,self.tag)
    def test_other_image_or_preexisting_suppressions_are_rejected(self):
        for key,value in [('imageID','sha256:'+'b'*64),('architecture','arm64'),('tags',[])]:
            bad=copy.deepcopy(self.scan);bad['source']['target'][key]=value
            with self.assertRaises(ValueError):module.document(bad,self.runtime,self.image,self.tag)
        bad=copy.deepcopy(self.scan);bad['ignoredMatches']=[{'unexpected':'suppression'}]
        with self.assertRaises(ValueError):module.document(bad,self.runtime,self.image,self.tag)
        with self.assertRaises(ValueError):module.document(self.scan,self.runtime,self.image,'pianotechpros-web:latest')

    def test_final_report_cannot_hide_unreviewed_findings(self):
        good=copy.deepcopy(self.scan)
        module.verify_result(good,self.image)
        for ignored in [True,False]:
            bad=copy.deepcopy(good)
            match={'vulnerability':{'id':'CVE-2099-0001','severity':'High'},'artifact':{'purl':module.PURLS[0]}}
            bad['ignoredMatches' if ignored else 'matches']=[match]
            with self.assertRaises(ValueError):module.verify_result(bad,self.image)
        good['ignoredMatches']=[{'vulnerability':{'id':'CVE-2026-105482'},'artifact':{'purl':module.PURLS[0]}}]
        module.verify_result(good,self.image)
        good['ignoredMatches'][0]['artifact']['purl']=module.PURLS[0].replace('24.22.2','24.18.0')
        with self.assertRaises(ValueError):module.verify_result(good,self.image)

class ScannerBoundary(RuntimeVEX):
    def test_scanner_errors_and_identity_drift_fail_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'scripts').mkdir();(root/'.bin').mkdir();(root/'bin').mkdir()
            for name in ['scan-web-image.sh','node-runtime-vex.py','check-node-runtime-security.mjs']:
                shutil.copy(Path(__file__).with_name(name),root/'scripts'/name)
            (root/'runtime.json').write_text(json.dumps(self.runtime));(root/'raw.json').write_text(json.dumps(self.scan))
            driver=root/'bin'/'docker'
            driver.write_text("""#!/usr/bin/env python3
import json,os,sys
from pathlib import Path
r=Path(os.environ['TEST_ROOT']);stage=os.environ.get('FAIL_STAGE','');a=sys.argv[1:]
with (r/'calls').open('a') as f:f.write('docker '+str(a)+'\\n')
if a[:2]==['image','inspect']:
 c=r/'inspect-count';n=int(c.read_text())+1 if c.exists() else 1;c.write_text(str(n))
 print('sha256:'+('b' if stage=='retag' and n>=3 else 'a')*64)
elif a[:1]==['run']:
 sys.stdin.read()
 if stage=='runtime':sys.exit(9)
 d=json.loads((r/'runtime.json').read_text())
 if stage=='bad_runtime':d['node']='v24.18.0'
 print(json.dumps(d))
elif a[:1]!=['tag'] and a[:2]!=['image','rm']:sys.exit(99)
""")
            grype=root/'.bin'/'grype'
            grype.write_text("""#!/usr/bin/env python3
import json,os,sys
from pathlib import Path
r=Path(os.environ['TEST_ROOT']);stage=os.environ.get('FAIL_STAGE','');final='--vex' in sys.argv
with (r/'calls').open('a') as f:f.write('grype '+str(sys.argv[1:])+'\\n')
if stage==('final' if final else 'raw'):sys.exit(2)
d=json.loads((r/'raw.json').read_text())
if final and stage=='hidden':d['ignoredMatches']=[{'vulnerability':{'id':'CVE-2099-0001'}}]
if not final and stage=='bad_scan':d['source']['target']['imageID']='sha256:'+'b'*64
print(json.dumps(d))
""")
            driver.chmod(0o755);grype.chmod(0o755)
            env={**os.environ,'TEST_ROOT':str(root),'PATH':str(root/'bin')+':'+os.environ['PATH']}
            for stage in ['', 'runtime', 'raw', 'final', 'bad_runtime', 'bad_scan', 'hidden', 'retag']:
                with self.subTest(stage=stage):
                    (root/'inspect-count').unlink(missing_ok=True)
                    result=subprocess.run(['bash',str(root/'scripts'/'scan-web-image.sh'),'candidate'],env={**env,'FAIL_STAGE':stage},capture_output=True,text=True)
                    self.assertEqual(result.returncode==0,stage=='',result.stderr)
            self.assertTrue((root/'build'/'production-image-evidence'/'web-raw.json').exists())
            self.assertIn("'image', 'rm'",(root/'calls').read_text())

if __name__=='__main__':unittest.main()

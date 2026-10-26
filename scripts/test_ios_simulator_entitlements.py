import plistlib
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

class SimulatorEntitlementsTests(unittest.TestCase):
    def run_check(self, values):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'signed.plist'
            path.write_bytes(plistlib.dumps(values))
            return subprocess.run([sys.executable, str(Path(__file__).with_name('check-ios-simulator-entitlements.py')), str(path)], capture_output=True).returncode

    def test_exact_synthetic_identity(self):
        identity = 'PIANOTESTS.com.pianotechpros.pianotechpros'
        self.assertEqual(self.run_check({'application-identifier': identity, 'keychain-access-groups': [identity]}), 0)

    def test_rejects_unsigned_foreign_and_shared_groups(self):
        identity = 'PIANOTESTS.com.pianotechpros.pianotechpros'
        for values in [{}, {'application-identifier': identity}, {'application-identifier': 'foreign', 'keychain-access-groups': [identity]}, {'application-identifier': identity, 'keychain-access-groups': [identity, 'foreign']}]:
            with self.subTest(values=values):
                self.assertNotEqual(self.run_check(values), 0)

if __name__ == '__main__':
    unittest.main()

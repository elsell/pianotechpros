"""Validate the test app's actual codesign entitlement output before installation."""
import plistlib
import sys
from pathlib import Path

expected = 'PIANOTESTS.com.pianotechpros.pianotechpros'
try:
    entitlements = plistlib.loads(Path(sys.argv[1]).read_bytes())
    if not isinstance(entitlements, dict):
        raise ValueError('expected an entitlement dictionary')
    if entitlements.get('application-identifier') != expected:
        raise ValueError('missing or mismatched simulator application identity')
    if entitlements.get('keychain-access-groups') != [expected]:
        raise ValueError('simulator Keychain access groups must match only the test app')
except (IndexError, OSError, ValueError, plistlib.InvalidFileException) as error:
    raise SystemExit(f'Invalid simulator signing entitlements: {error}')
print('PASS: simulator signing identity and Keychain group match the synthetic app')

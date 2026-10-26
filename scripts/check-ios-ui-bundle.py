"""Reject an unbundled or externally configured simulator acceptance product."""
import json
from pathlib import Path
import sys

try:
    app = Path(sys.argv[1])
    bundle = app / 'main.jsbundle'
    if not bundle.is_file() or bundle.stat().st_size == 0:
        raise ValueError('missing or empty embedded JavaScript bundle')
    configuration = json.loads((app / 'EXConstants.bundle' / 'app.config').read_text())
    expected = {'environment':'development', 'apiURL':'http://127.0.0.1:18082',
                'oidcIssuer':'http://127.0.0.1:18082/oidc', 'oidcClientId':'pianotechpros-mobile'}
    application = configuration.get('extra', {}).get('application', {})
    if not isinstance(application, dict) or any(application.get(key) != value for key,value in expected.items()):
        raise ValueError('embedded configuration must match the isolated UI fixture')
except (IndexError, OSError, ValueError, AttributeError) as error:
    raise SystemExit(f'Invalid simulator UI bundle: {error}')
print('PASS: embedded JavaScript and isolated UI fixture configuration verified')

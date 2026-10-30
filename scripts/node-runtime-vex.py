#!/usr/bin/env python3
"""Reconcile only reviewed fixed Node bytes, image identity and exact RPM PURLs."""
import json
import re
import sys
from pathlib import Path

HASHES = {
    '/usr/bin/node-24': 'b942d31a91e21be08b5737ad064370569b03915477fec7f951db5647de9b7860',
    '/usr/lib64/libnode.so.137': 'd2debb699db612ad3825398c5c7a41ab057006b5382344348047a5069c7c0c87',
}
PACKAGES = [
    ('nodejs24','24.22.2-0.1.hum1','x86_64','1'),
    ('nodejs24-bin','24.22.2-0.1.hum1','noarch','1'),
    ('nodejs24-libs','24.22.2-0.1.hum1','x86_64','1'),
    ('nodejs24-npm','11.19.1-1.24.22.2.0.1.hum1','noarch','2'),
    ('nodejs24-npm-bin','24.22.2-0.1.hum1','noarch','2'),
]
PURLS = [f'pkg:rpm/redhat/{name}@{version}?arch={arch}&distro=hummingbird-20251124&epoch={epoch}&upstream=nodejs24-24.22.2-0.1.hum1.src.rpm' for name,version,arch,epoch in PACKAGES]

def document(scan, runtime, image, tag):
    if not re.fullmatch(r'sha256:[a-f0-9]{64}', image) or tag != 'pianotechpros-web:sha256-' + image[7:]:
        raise ValueError('VEX requires an image-content-derived tag')
    source=scan.get('source',{});target=source.get('target',{})
    if source.get('type')!='image' or target.get('imageID')!=image or target.get('architecture')!='amd64' or tag not in target.get('tags',[]):
        raise ValueError('Raw scan image identity does not match verified runtime')
    # Grype omits ignoredMatches when no findings were suppressed.
    if scan.get('ignoredMatches') not in (None, []):
        raise ValueError('Raw scan contains unexpected preexisting suppressions')
    expected={'node':'v24.22.2','architecture':'x64','hashes':HASHES,'dns':'NUL rejected','tls':'non-canonical rejected; legitimate identities accepted'}
    if runtime != expected:
        raise ValueError('Runtime bytes or security regressions differ from reviewed evidence')
    stamp='2026-10-30T15:00:00Z'
    return {
        '@context':'https://openvex.dev/ns/v0.2.0',
        '@id':'https://github.com/elsell/pianotechpros/security/node-runtime/'+image[7:],
        'author':'PianoTechPros engineering','version':1,'timestamp':stamp,
        'statements':[
            {'vulnerability':{'name':cve},'products':[{'@id':tag,'subcomponents':[{'@id':p} for p in PURLS]}],
             'status':'fixed','timestamp':stamp,
             'status_notes':'Upstream Node 24.22.1 fixes this CVE. Signed Red Hat 24.22.2 runtime bytes verified by SHA256 and offline regressions; exact image and RPM scope only. See specs/platform/testing.spec.md and https://nodejs.org/en/blog/release/v24.22.1.'}
            for cve in ['CVE-2026-105482','CVE-2026-106069']
        ],
    }

def verify_result(scan, image):
    if scan.get('source',{}).get('target',{}).get('imageID') != image:
        raise ValueError('Reconciled scan image identity changed')
    for match in scan.get('ignoredMatches') or []:
        if match.get('vulnerability',{}).get('id') not in {'CVE-2026-105482','CVE-2026-106069'} or match.get('artifact',{}).get('purl') not in PURLS:
            raise ValueError('Reconciled scan ignored an unreviewed finding')
    if not isinstance(scan.get('matches'),list) or scan.get('ignoredMatches') is not None and not isinstance(scan['ignoredMatches'],list):
        raise ValueError('Incomplete scanner report')
    if any(m.get('vulnerability',{}).get('severity') in {'High','Critical'} for m in scan['matches']):
        raise ValueError('High-severity findings remain')

if __name__=='__main__':
    if len(sys.argv)==4 and sys.argv[1]=='--verify-result':
        verify_result(json.loads(Path(sys.argv[2]).read_text()),sys.argv[3])
        print('Exact-image runtime reconciliation verified; high-severity gate retained')
        raise SystemExit(0)
    if len(sys.argv)!=5:raise SystemExit('usage: node-runtime-vex.py RAW_SCAN RUNTIME IMAGE_ID TAG')
    result=document(json.loads(Path(sys.argv[1]).read_text()),json.loads(Path(sys.argv[2]).read_text()),sys.argv[3],sys.argv[4])
    print(json.dumps(result,indent=2))

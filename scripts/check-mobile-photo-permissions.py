#!/usr/bin/env python3
"""Validate prebuilt native permission output against the shared locale catalog."""
import json
import plistlib
from pathlib import Path
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[1]
app = root / 'apps/mobile'
config = json.loads((app / 'app.json').read_text())['expo']
project = app / 'ios' / config['name']
info = plistlib.loads((project / 'Info.plist').read_bytes())
for language in ('en', 'es'):
    catalog = json.loads((root / f'packages/i18n/src/locales/{language}.json').read_text())
    strings = (project / f'Supporting/{language}.lproj/InfoPlist.strings').read_text()
    for native, key in [('NSCameraUsageDescription', 'cameraPermission'), ('NSPhotoLibraryUsageDescription', 'libraryPermission')]:
        expected = catalog[f'inventory.photos.{key}']
        assert f'{native} = "{expected}";' in strings, f'{language}: missing shared {native} copy'
        if language == 'en':
            assert info[native] == expected, f'default {native} must match the shared catalog'
assert 'NSMicrophoneUsageDescription' not in info, 'still-photo selection must not request microphone access'
manifest = ET.parse(app / 'android/app/src/main/AndroidManifest.xml').getroot()
android = '{http://schemas.android.com/apk/res/android}'
tools = '{http://schemas.android.com/tools}'
assert any(node.get(android + 'name') == 'android.permission.RECORD_AUDIO' and node.get(tools + 'node') == 'remove' for node in manifest.findall('uses-permission')), 'Android must exclude the picker microphone permission'
print('Generated photo permission locales and microphone exclusions verified')

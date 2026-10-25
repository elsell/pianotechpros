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
for language in ('en', 'es'):
    catalog = json.loads((root / f'packages/i18n/src/locales/{language}.json').read_text())
    strings = (project / f'Supporting/{language}.lproj/InfoPlist.strings').read_text()
    expected = catalog['voice.microphonePermission']
    assert f'NSMicrophoneUsageDescription = "{expected}";' in strings
    if language == 'en':
        assert info['NSMicrophoneUsageDescription'] == expected
assert 'audio' not in info.get('UIBackgroundModes', []), 'voice capture must remain foreground only'
manifest = ET.parse(app / 'android/app/src/main/AndroidManifest.xml').getroot()
android = '{http://schemas.android.com/apk/res/android}'
tools = '{http://schemas.android.com/tools}'
permissions = manifest.findall('uses-permission')
assert any(node.get(android + 'name') == 'android.permission.RECORD_AUDIO' and node.get(tools + 'node') != 'remove' for node in permissions), 'voice capture needs explicit microphone permission'
assert not any(node.get(android + 'name') == 'android.permission.RECORD_AUDIO' and node.get(tools + 'node') == 'remove' for node in permissions), 'a photo-only exclusion must not disable voice capture'
assert not any(node.get(android + 'name') in ('android.permission.FOREGROUND_SERVICE_MICROPHONE', 'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK') and node.get(tools + 'node') != 'remove' for node in permissions)
assert not any(node.get(android + 'name') in ('expo.modules.audio.service.AudioControlsService', 'expo.modules.audio.service.AudioRecordingService') and node.get(tools + 'node') != 'remove' for node in manifest.findall('./application/service'))
print('Generated photo/voice permission locales and foreground-only audio verified')

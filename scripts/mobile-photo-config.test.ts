import test from 'node:test';
import assert from 'node:assert/strict';
import configure from '../apps/mobile/app.config';
import en from '../packages/i18n/src/locales/en.json';
import es from '../packages/i18n/src/locales/es.json';
test('native permission configuration uses shared catalogs and declares foreground voice recording without background audio',()=>{
 const config=configure({config:{plugins:['expo-router'],ios:{bundleIdentifier:'example.app',infoPlist:{existing:true}}}});
 assert.equal(config.plugins[0],'expo-router');
 assert.deepEqual(config.plugins[1],['expo-image-picker',{cameraPermission:en['inventory.photos.cameraPermission'],photosPermission:en['inventory.photos.libraryPermission'],microphonePermission:en['voice.microphonePermission']}]);
 assert.deepEqual(config.plugins[2],['expo-localization',{supportedLocales:{ios:['en','es'],android:['en','es']}}]);
 assert.deepEqual(config.plugins[3],['expo-audio',{microphonePermission:en['voice.microphonePermission'],recordAudioAndroid:true,enableBackgroundRecording:false,enableBackgroundPlayback:false}]);
 assert.deepEqual(config.plugins[4],['expo-camera',{cameraPermission:en['inventory.photos.cameraPermission'],microphonePermission:en['voice.microphonePermission'],recordAudioAndroid:false,barcodeScannerEnabled:true}]);
 for(const [locale,catalog] of [['en',en],['es',es]] as const){
  assert.deepEqual(config.locales[locale].ios,{NSCameraUsageDescription:catalog['inventory.photos.cameraPermission'],NSPhotoLibraryUsageDescription:catalog['inventory.photos.libraryPermission'],NSMicrophoneUsageDescription:catalog['voice.microphonePermission']});
 }
 assert.equal(config.ios.bundleIdentifier,'example.app');assert.equal(config.ios.infoPlist.existing,true);assert.equal(config.ios.infoPlist.CFBundleAllowMixedLocalizations,true);
});

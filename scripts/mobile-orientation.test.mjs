import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../apps/mobile/package.json',import.meta.url));
const expoRequire=createRequire(require.resolve('expo/package.json'));
const {AndroidConfig,IOSConfig}=expoRequire('@expo/config-plugins');
const {expo:config}=JSON.parse(readFileSync(new URL('../apps/mobile/app.json',import.meta.url)));
test('Android prebuild allows the system to choose portrait or landscape',()=>{
 const manifest={manifest:{application:[{activity:[{$:{'android:name':'.MainActivity'},'intent-filter':[{action:[{$:{'android:name':'android.intent.action.MAIN'}}]}]}]}]}};
 const result=AndroidConfig.Orientation.setAndroidOrientation(config,manifest);
 assert.equal(result.manifest.application[0].activity[0].$['android:screenOrientation'],'unspecified');
});
test('iOS prebuild supports portrait and both landscape orientations',()=>{
 const result=IOSConfig.Orientation.setOrientation(config,{});
 for(const value of ['UIInterfaceOrientationPortrait','UIInterfaceOrientationLandscapeLeft','UIInterfaceOrientationLandscapeRight'])assert.ok(result.UISupportedInterfaceOrientations.includes(value),value);
});

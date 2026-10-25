import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {applyAppearanceHook}=require('../apps/mobile/plugins/with-native-system-bars.cjs');
const activity=`package example.app
import com.facebook.react.ReactActivity
class MainActivity : ReactActivity() {
  override fun onCreate(state: android.os.Bundle?) { super.onCreate(null) }
}
`;
test('prebuild preserves activity behavior and installs the native appearance hook exactly once',()=>{
 const changed=applyAppearanceHook(activity);assert.ok(changed.includes('override fun onCreate(state: android.os.Bundle?) { super.onCreate(null) }'));
 assert.equal(changed.match(/override fun onConfigurationChanged/g)?.length,1);
 assert.equal(applyAppearanceHook(changed),changed);
});
test('prebuild rejects unsupported or conflicting activities instead of replacing custom native behavior',()=>{
 assert.throws(()=>applyAppearanceHook('public class MainActivity extends ReactActivity {}'),/unsupported_native_activity/);
 assert.throws(()=>applyAppearanceHook(activity.replace('override fun onCreate','override fun onConfigurationChanged(config: android.content.res.Configuration) {}\n  override fun onCreate')),/existing_native_configuration_callback/);
 const changed=applyAppearanceHook(activity);assert.throws(()=>applyAppearanceHook(changed.replace('super.onConfigurationChanged(newConfig)','customConfiguration(newConfig)')),/modified_native_system_bar_hook/);
});

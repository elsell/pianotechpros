import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {readFileSync,mkdtempSync,mkdirSync,copyFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
const {verifyNativeTextSources,sourceBuildPodfile}=require('../apps/mobile/plugins/with-native-text-input.cjs');
const manifest=require('../patches/react-native-text-input.json');
const mobileRequire=createRequire(new URL('../apps/mobile/package.json',import.meta.url));
const installed=dirname(mobileRequire.resolve('react-native/package.json'));
test('native compilation rejects original or changed source and accepts only the pinned backport',()=>{
 const root=mkdtempSync(join(tmpdir(),'piano-native-text-'));
 try{
  copyFileSync(join(installed,'package.json'),join(root,'package.json'));
  for(const path of Object.keys(manifest.files)){
   mkdirSync(dirname(join(root,path)),{recursive:true});copyFileSync(join(installed,path),join(root,path));
  }
  const first=Object.keys(manifest.files)[0];
  const digest=createHash('sha256').update(readFileSync(join(root,first))).digest('hex');
  const patch=resolve('patches/react-native@0.83.10.patch');
  assert.equal(createHash('sha256').update(readFileSync(patch)).digest('hex'),manifest.patchSha256);
  if(digest===manifest.files[first].patchedSha256)execFileSync('git',['apply','--reverse',patch],{cwd:root});
  for(const [path,hashes] of Object.entries(manifest.files))assert.equal(createHash('sha256').update(readFileSync(join(root,path))).digest('hex'),hashes.originalSha256);
  assert.throws(()=>verifyNativeTextSources(root),/unverified_native_text_source/);
  execFileSync('git',['apply',patch],{cwd:root});verifyNativeTextSources(root);
  writeFileSync(join(root,first),readFileSync(join(root,first),'utf8')+'\n');
  assert.throws(()=>verifyNativeTextSources(root),/unverified_native_text_source/);
  writeFileSync(join(root,'package.json'),JSON.stringify({version:'0.0.0'}));
  assert.throws(()=>verifyNativeTextSources(root),/unsupported_native_text_version/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('source build overrides inherited prebuilt defaults and preserves normal pod setup',()=>{
 const original="ENV['RCT_USE_PREBUILT_RNCORE'] ||= '1'\nuse_react_native!()\n";
 const changed=sourceBuildPodfile(original);
 assert.ok(changed.indexOf("ENV['RCT_USE_PREBUILT_RNCORE'] = '0'")<changed.indexOf("||= '1'"));
 assert.ok(changed.endsWith(original));assert.equal(sourceBuildPodfile(changed),changed);
 assert.throws(()=>sourceBuildPodfile("ENV['RCT_USE_PREBUILT_RNCORE'] = '1'\n"),/conflicting_native_core_build_override/);
 assert.throws(()=>sourceBuildPodfile(changed.replace("= '0'","= '1'")),/modified_native_text_build_directive/);
 assert.throws(()=>sourceBuildPodfile(changed+"ENV['RCT_USE_PREBUILT_RNCORE'] = '1'\n"),/conflicting_native_core_build_override/);
 assert.throws(()=>sourceBuildPodfile(changed+"ENV['RCT_TESTONLY_RNCORE_TARBALL_PATH'] = '/tmp/core.tgz'\n"),/conflicting_native_core_build_override/);
 assert.throws(()=>sourceBuildPodfile(changed+"ENV['RCT_TESTONLY_RNCORE_TARBALL_PATH'] ||= '/tmp/core.tgz'\n"),/conflicting_native_core_build_override/);
});
test('generated Podfile clears a local prebuilt-core tarball override before evaluating pod setup',()=>{
 const source=sourceBuildPodfile('')+"raise 'unexpected_tarball' if ENV['RCT_TESTONLY_RNCORE_TARBALL_PATH']\nputs ENV['RCT_USE_PREBUILT_RNCORE']\n";
 assert.equal(execFileSync('ruby',['-e',source],{env:{...process.env,RCT_USE_PREBUILT_RNCORE:'1',RCT_TESTONLY_RNCORE_TARBALL_PATH:''},encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim(),'0');
 assert.equal(execFileSync('ruby',['-e',source],{env:{...process.env,RCT_TESTONLY_RNCORE_TARBALL_PATH:'/tmp/unpatched-core.tar.gz'},encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim(),'0');
});

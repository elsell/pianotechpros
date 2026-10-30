const {withPodfile,withPodfileProperties}=require('expo/config-plugins');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {createHash}=require('node:crypto');
const manifest=require('../../../patches/react-native-text-input.json');
const marker='# PianoTechPros pinned native text comparison';
const directive=`${marker}\nENV.delete('RCT_TESTONLY_RNCORE_TARBALL_PATH')\nENV['RCT_USE_PREBUILT_RNCORE'] = '0'\n`;
function verifyNativeTextSources(root){
 const version=JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version;
 if(version!==manifest.version)throw Error('unsupported_native_text_version');
 for(const [path,hashes] of Object.entries(manifest.files)){
  const digest=createHash('sha256').update(readFileSync(join(root,path))).digest('hex');
  if(digest!==hashes.patchedSha256)throw Error('unverified_native_text_source');
 }
}
function sourceBuildPodfile(source){
 let body=source;
 if(source.includes(marker)){
  if(!source.startsWith(directive))throw Error('modified_native_text_build_directive');
  body=source.slice(directive.length);
 }
 if(/ENV\[['"]RCT_USE_PREBUILT_RNCORE['"]\]\s*=(?!=)/.test(body)||body.includes('RCT_TESTONLY_RNCORE_TARBALL_PATH'))throw Error('conflicting_native_core_build_override');
 return directive+body;
}
module.exports=config=>{
 config=withPodfileProperties(config,config=>{
  config.modResults['ios.buildReactNativeFromSource']='true';
  return config;
 });
 return withPodfile(config,config=>{
  verifyNativeTextSources(require('node:path').dirname(require.resolve('react-native/package.json')));
  config.modResults.contents=sourceBuildPodfile(config.modResults.contents);
  return config;
 });
};
module.exports.verifyNativeTextSources=verifyNativeTextSources;
module.exports.sourceBuildPodfile=sourceBuildPodfile;

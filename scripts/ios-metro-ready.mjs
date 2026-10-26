import {pathToFileURL} from 'node:url';

class ReadinessError extends Error {}
export async function verifyIOSMetro(origin) {
 const base=new URL(origin);
 if(base.protocol!=='http:'||base.hostname!=='127.0.0.1'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw new ReadinessError('Metro must use an explicit loopback origin');
 const request=async(url,stage)=>{
  const response=await fetch(url,{headers:{'expo-platform':'ios',Accept:'application/expo+json,application/json'},redirect:'error',signal:AbortSignal.timeout(180_000)});
  if(!response.ok)throw new ReadinessError(`Metro ${stage} returned HTTP ${response.status}`);
  return response;
 };
 let bundle;
 try {
  const manifest=await (await request(base,'manifest')).json();
  bundle=new URL(manifest.launchAsset?.url);
 } catch {throw new ReadinessError('Metro manifest unavailable or malformed');}
 if(bundle.origin!==base.origin||bundle.username||bundle.password||bundle.hash)throw new ReadinessError('Metro bundle must use the same loopback origin');
 const response=await request(bundle,'bundle');
 if(!/^(application|text)\/javascript(?:;|$)/i.test(response.headers.get('content-type')??''))throw new ReadinessError('Metro bundle must be JavaScript');
 let bundleBytes=0;
 for await(const chunk of response.body){bundleBytes+=chunk.byteLength;if(bundleBytes>64*1024*1024)throw new ReadinessError('Metro bundle exceeds readiness size bound');}
 if(!bundleBytes)throw new ReadinessError('Metro bundle is empty');
 return {bundleBytes};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const result=await verifyIOSMetro(process.argv[2]);console.log(`PASS: iOS Metro manifest and bundle ready (${result.bundleBytes} bytes)`);}
 catch(error){console.error(`iOS Metro readiness failed: ${error instanceof ReadinessError?error.message:'Metro request failed or timed out'}`);process.exitCode=1;}
}

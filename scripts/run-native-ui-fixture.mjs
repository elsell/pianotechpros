import {startNativeUIFixture} from './native-ui-fixture.mjs';
const port=Number(process.argv[2]??18082);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid fixture port');
const fixture=await startNativeUIFixture({port,inventory:true,onAuthResponse:event=>console.log(JSON.stringify(event))});
console.log('Native UI fixture ready on loopback port '+port);
let closing=false;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{if(closing)return;closing=true;await fixture.close();});

import test from 'node:test';
import assert from 'node:assert/strict';
import {publicWebOriginConfig} from './index.js';
import {showroomMetadata,pianoMetadata} from './showroom-metadata.js';
const profile={id:'shop',slug:'workshop',name:'Workshop',description:'Public showroom',tagline:'Ready to play',email:'shop@example.com',phone:'',street_address_1:'1 Example St',street_address_2:'',city:'Example',region:'CA',postal_code:'90000',banner:null};
const piano={id:'12345678-1234-4234-8234-123456789abc',dealer_id:'shop',title:'Grand',description:'Public description',stock_number:'STOCK-1',make:'Maker',model:'Model',status:'available',condition:'used',price:{minor_units:9007199254740991,currency:'USD'},photos:[{id:'cover',alt_text:''}]};
test('discovery requires an explicit validated origin, never an inferred request host',()=>{
 assert.equal(publicWebOriginConfig(undefined,'production'),null);
 assert.equal(publicWebOriginConfig('https://pianos.example/','production'),'https://pianos.example');
 assert.equal(publicWebOriginConfig('http://localhost:5187','development'),'http://localhost:5187');
 for(const value of ['', 'https://user:secret@pianos.example','https://pianos.example/path','https://pianos.example/?x=1','https://pianos.example/#x','http://pianos.example','https://localhost','https://10.0.0.1','https://internal'])assert.throws(()=>publicWebOriginConfig(value,'production'));
 assert.equal(showroomMetadata(null,profile),null);assert.equal(pianoMetadata(null,profile,piano),null);
});
test('product metadata whitelists published fields and preserves exact price precision',()=>{
 const metadata=pianoMetadata('https://pianos.example',profile,{...piano,serial:'PRIVATE',private_notes:'PRIVATE',acquisition_cost:'PRIVATE'});
 assert.ok(metadata);const data=JSON.parse(metadata.jsonLD);
 assert.equal(data.offers.price,'90071992547409.91');assert.equal(data.offers.availability,'https://schema.org/InStock');
 assert.equal(data.url,'https://pianos.example/showrooms/workshop/pianos/grand-'+piano.id);
 assert.equal(data.sku,'STOCK-1');assert.equal(metadata.jsonLD.includes('PRIVATE'),false);
 assert.equal(data.aggregateRating,undefined);assert.equal(data.review,undefined);
 assert.equal(JSON.parse(pianoMetadata('https://pianos.example',profile,{...piano,price:{minor_units:12345,currency:'JPY'}})!.jsonLD).offers.price,'12345');
});
test('hidden prices omit offers; lifecycle and script text remain truthful and inert',()=>{
 const hidden=JSON.parse(pianoMetadata('https://pianos.example',profile,{...piano,price:null})!.jsonLD);assert.equal(hidden.offers,undefined);
 for(const [status,availability] of [['reserved','LimitedAvailability'],['sold','SoldOut']])assert.equal(JSON.parse(pianoMetadata('https://pianos.example',profile,{...piano,status})!.jsonLD).offers.availability,'https://schema.org/'+availability);
 const unsafe='</script><script>alert(1)</script>&\u2028';
 const metadata=pianoMetadata('https://pianos.example',profile,{...piano,description:unsafe})!;
 assert.equal(metadata.jsonLD.includes('<'),false);assert.equal(metadata.jsonLD.includes('&'),false);assert.equal(JSON.parse(metadata.jsonLD).description,unsafe);
 assert.throws(()=>pianoMetadata('https://pianos.example',profile,{...piano,dealer_id:'other'}));
 assert.throws(()=>pianoMetadata('https://pianos.example',profile,{...piano,status:'draft'}));
});
test('showroom metadata uses only public identity and the scoped current banner',()=>{
 const metadata=showroomMetadata('https://pianos.example',{...profile,banner:{id:'banner',width:1200,height:600},private_notes:'PRIVATE'})!;
 const data=JSON.parse(metadata.jsonLD);assert.equal(data['@type'],'Store');assert.equal(data.name,'Workshop');assert.equal(data.address.addressLocality,'Example');
 assert.equal(metadata.image,'https://pianos.example/showrooms/workshop/banner/banner');assert.equal(metadata.jsonLD.includes('PRIVATE'),false);
});

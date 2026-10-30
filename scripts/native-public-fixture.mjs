import {readFileSync} from 'node:fs';
// Synthetic anonymous projections only; production visibility is tested at the real API.
export function createNativePublicFixture(){
 const profile={id:'public-shop',slug:'native-public-shop',name:'Native Public Showroom',email:'public@example.test',phone:'',website_url:'',tagline:'Synthetic public collection',description:'',street_address_1:'',street_address_2:'',city:'',region:'',postal_code:'',appointment_note:'',delivery_note:'',warranty_note:'',service_note:'',banner_alt_text:'',accent_color:'#245b43',banner:null};
 const pianos=['grand','reserved','sold'].map((kind,index)=>({id:'public-'+kind,dealer_id:profile.id,publication_revision:1,status:kind==='grand'?'available':kind,stock_number:`UI-PUBLIC-${index+1}`,title:kind==='grand'?'Native Public Grand':`Native Public ${kind}`,featured:false,form:'grand',player_system:false,condition:'used',make:'Synthetic',model:'',manufactured:null,size:'',finish:'',description:'Published synthetic piano',price:{minor_units:125000,currency:'USD'},photos:[{id:'front',alt_text:'Synthetic public piano photo'}]}));
 const photo=readFileSync(new URL('./fixtures/showroom.jpg',import.meta.url));
 return (req,url,res,send)=>{
  if(url.pathname!=='/v1/showroom-discovery'&&!url.pathname.startsWith('/v1/showrooms/'))return false;
  if(req.headers.authorization||req.headers.cookie){send(400,{code:'unexpected_public_credentials'});return true;}
  if(req.method!=='GET'){send(405,{code:'bad_request'});return true;}
  if(url.pathname==='/v1/showroom-discovery'){send(200,{data:{shops:[{id:profile.id,slug:profile.slug,name:profile.name}]}});return true;}
  const base='/v1/showrooms/'+profile.slug+'/pianos';
  if(url.pathname===base){
   const q=url.searchParams,availability=q.get('availability'),search=(q.get('search')??'').trim().toLowerCase();
   const result=pianos.filter(p=>(availability==='all'||availability?p.status===availability||availability==='all':p.status!=='sold')&&(!q.get('form')||p.form===q.get('form'))&&(!q.get('currency')||p.price.currency===q.get('currency'))&&(!q.has('minPrice')||p.price.minor_units>=Number(q.get('minPrice')))&&(!q.has('maxPrice')||p.price.minor_units<=Number(q.get('maxPrice')))&&[p.stock_number,p.title,p.make,p.model].some(value=>value.toLowerCase().includes(search)));
   send(200,{data:{profile,pianos:result.slice(0,Number(q.get('limit')??12))},meta:{}});return true;
  }
  const piano=pianos.find(p=>url.pathname===base+'/'+p.id||url.pathname===base+'/'+p.id+'/photos/front');
  if(piano){if(url.pathname.endsWith('/photos/front')){res.writeHead(200,{'Content-Type':'image/jpeg'});res.end(photo);}else send(200,{data:{profile,piano}});return true;}
  send(404,{code:'not_found'});return true;
 };
}

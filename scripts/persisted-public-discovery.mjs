import assert from 'node:assert/strict';

const origin='https://pianos.example';
export async function verifyPublicDiscovery(request,{base,slug,recordID,title,privateValues,canonical,unpublished=false}){
 const read=async (path,options)=>{
  const response=await request.get(base+path,options);
  assert.equal(response.status(),200,path);
  const body=await response.text();
  for(const value of privateValues)assert.ok(!body.includes(value),'private value excluded from '+path);
  return body;
 };
 const map=await read('/sitemap-showroom-'+slug+'.xml');
 const locations=[...map.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match=>match[1]);
 for(const location of locations){const url=new URL(location);assert.equal(url.origin,origin);assert.ok(url.pathname.startsWith('/showrooms/'+slug));assert.equal(url.search,'');}
 const alias='/showrooms/'+slug+'/pianos/'+recordID;
 if(unpublished){
  assert.ok(!locations.some(url=>url.includes(recordID)));
  for(const path of [alias,canonical.slice(origin.length)]){
   const response=await request.get(base+path,{maxRedirects:0});assert.equal(response.status(),404);assert.equal(response.headers().location,undefined);
  }
  return;
 }
 const redirect=await request.get(base+alias+'?secret=never-copy',{maxRedirects:0});assert.equal(redirect.status(),307);
 const path=redirect.headers().location;assert.equal(path,'/showrooms/'+slug+'/pianos/'+title.toLowerCase().replaceAll(' ','-')+'-'+recordID);assert.ok(!path.includes('?'));
 canonical=origin+path;assert.ok(locations.includes(canonical));
 const html=await read(path);assert.ok(html.includes('rel="canonical" href="'+canonical+'"'));
 const structured=html.match(/<script type="application\/ld\+json" data-public-discovery>([\s\S]*?)<\/script>/);assert.ok(structured,'server-rendered JSON-LD');
 const data=JSON.parse(structured[1]);assert.equal(data['@type'],'Product');assert.equal(data.name,title);assert.equal(data.url,canonical);assert.equal(data.offers.price,'1234.56');assert.equal(data.offers.priceCurrency,'USD');assert.equal(data.offers.availability,'https://schema.org/InStock');
 assert.ok((await read('/robots.txt')).includes('Sitemap: '+origin+'/sitemap.xml'));
 assert.ok((await read('/sitemap.xml')).includes('<loc>'+origin+'/sitemap-showroom-'+slug+'.xml</loc>'));
 const discovery=await read('/llms.txt',{headers:{'accept-language':'es'}});assert.ok(discovery.includes(origin+'/showrooms/'+slug));assert.ok(discovery.includes('Salas de exposición'));
 assert.equal(data.image.length,1);assert.ok(data.image[0].startsWith(origin+'/showrooms/'+slug+'/pianos/'+recordID+'/photos/'));
 return canonical;
}

import assert from 'node:assert/strict';

export async function verifyPersistedShowroomFilters(page,{context,base,slug,title,recordURL,authorization}){
 const open=async()=>{await page.goto(`${base}/showrooms/${slug}?search=${encodeURIComponent(title+' initial-filter')}`);await page.locator('details.filters').waitFor();if(!(await page.locator('details.filters').evaluate(node=>node.open)))await page.locator('details.filters summary').click();};
 const search=async({form='',currency='',minimum='',maximum='',availability='',query=title,count=1}={})=>{
  await open();await page.getByLabel('Search pianos',{exact:true}).fill(query);await page.getByLabel('Piano type',{exact:true}).selectOption(form);await page.getByLabel('Currency',{exact:true}).selectOption(currency);await page.getByLabel('Minimum price',{exact:true}).fill(minimum);await page.getByLabel('Maximum price',{exact:true}).fill(maximum);await page.getByLabel('Availability',{exact:true}).selectOption(availability);
  await Promise.all([page.waitForURL(url=>url.searchParams.get('search')===query),page.getByRole('button',{name:'Show pianos',exact:true}).click()]);
  if(count)await page.getByRole('heading',{level:2,name:title,exact:true}).waitFor();else await page.getByText('No pianos match these filters.',{exact:true}).waitFor();
  assert.equal(await page.locator('.grid article').count(),count);if(count)assert.deepEqual(await page.locator('.grid h2').allTextContents(),[title]);
 };
 await search();await search({form:'grand'});await search({form:'studio_upright',count:0});
 await search({currency:'USD',minimum:'1234.56',maximum:'1234.56'});await search({currency:'USD',minimum:'1234.57',count:0});await search({currency:'USD',maximum:'1234.55',count:0});await search({currency:'CAD',count:0});
 const read=async()=>{const response=await context.request.get(recordURL,{headers:{authorization}});assert.equal(response.status(),200);return(await response.json()).data;};
 const record=await read();const privateTitle=title+' private-only';const changed=await context.request.put(recordURL,{headers:{authorization},data:{expectedRevision:record.revision,attributes:{...record.attributes,title:privateTitle}}});assert.equal(changed.status(),200);
 await search({query:privateTitle,count:0});await search();
 const saved=(await changed.json()).data;const sold=await context.request.post(recordURL+'/lifecycle',{headers:{authorization},data:{expectedRevision:saved.revision,status:'sold',salePrice:{minor_units:110025,currency:'USD'}}});assert.equal(sold.status(),200);
 await search({count:0});await search({availability:'sold'});await search({availability:'all'});
 const hidden=await context.request.post(recordURL+'/unpublish',{headers:{authorization},data:{expectedRevision:(await sold.json()).data.record.revision}});assert.equal(hidden.status(),200);await search({availability:'all',count:0});
}

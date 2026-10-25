import assert from 'node:assert/strict';

export async function verifyPhotoManagement({page,context,recordURL,authorization,buffer}){
 const read=async()=>{const response=await context.request.get(recordURL+'/photos',{headers:{authorization}});assert.equal(response.status(),200);return(await response.json()).data.photos;};
 const command=async(method,action)=>{
  const [response]=await Promise.all([page.waitForResponse(r=>r.request().method()===method&&r.url().startsWith(recordURL+'/photos')),action()]);
  assert.equal(response.status(),method==='POST'?201:200);
 };
 const original=(await read())[0].id;
 const preview=page.getByRole('button',{name:'Preview photo 1',exact:true});
 await preview.focus();await page.keyboard.press('Enter');const dialog=page.getByRole('dialog');await dialog.waitFor();
 await dialog.getByLabel('Describe this photo',{exact:true}).fill('Front of the synthetic piano');
 await command('PATCH',()=>dialog.getByRole('button',{name:'Save description',exact:true}).click());
 assert.equal((await read())[0].altText,'Front of the synthetic piano');
 await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await preview.evaluate(el=>el===document.activeElement),true);
 await command('POST',()=>page.getByLabel('Choose a photo',{exact:true}).setInputFiles({name:'synthetic-second.png',mimeType:'image/png',buffer}));
 await page.getByRole('button',{name:'Preview photo 2',exact:true}).waitFor();
 const photos=await read();assert.equal(photos.length,2);const second=photos[1].id;assert.notEqual(second,original);
 assert.equal((await context.request.get(recordURL+'/photos/'+second+'/image',{headers:{authorization}})).status(),200);
 const order=async(expected)=>assert.deepEqual((await read()).map(photo=>photo.id),expected);
 await command('PUT',()=>page.getByRole('button',{name:'Use as cover',exact:true}).nth(1).click());await order([second,original]);
 await command('PUT',()=>page.getByRole('button',{name:'Move earlier',exact:true}).nth(1).click());await order([original,second]);
 await command('PUT',()=>page.getByRole('button',{name:'Move later',exact:true}).nth(0).click());await order([second,original]);
 await page.getByRole('button',{name:'Remove photo',exact:true}).nth(0).click();await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();await order([second,original]);
 await page.getByRole('button',{name:'Remove photo',exact:true}).nth(0).click();await command('DELETE',()=>page.getByRole('dialog').getByRole('button',{name:'Remove photo',exact:true}).click());
 await page.getByRole('button',{name:'Preview photo 2',exact:true}).waitFor({state:'detached'});await order([original]);assert.equal((await read())[0].altText,'Front of the synthetic piano');
 assert.equal((await context.request.get(recordURL+'/photos/'+second+'/image',{headers:{authorization}})).status(),404);
 assert.equal((await context.request.get(recordURL+'/photos/'+original+'/image',{headers:{authorization}})).status(),200);
}

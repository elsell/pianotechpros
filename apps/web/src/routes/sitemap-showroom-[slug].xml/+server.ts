import {error} from '@sveltejs/kit';
import {createShowroomApiClient} from '@pianotechpros/api-client';
import {crawlerSitemap,publicPianoPath} from '@pianotechpros/client-core';
import {createTranslator} from '@pianotechpros/i18n';
import {publicWebOrigin,serverApiURL} from '#lib/server/config.js';
import {publicFailure} from '#lib/showroom/server.js';
import type {RequestHandler} from './$types';

export const GET:RequestHandler=async({params,locals,request,setHeaders})=>{
 setHeaders({'cache-control':'no-store'});
 if(!publicWebOrigin)error(503,createTranslator([locals.locale]).t('showroom.unavailable'));
 try{
  const catalog=await createShowroomApiClient(serverApiURL).catalog(params.slug,request.signal);
  const paths=['/showrooms/'+catalog.shop.slug,...catalog.pianos.map(piano=>publicPianoPath(catalog.shop.slug,piano))];
  return new Response(crawlerSitemap(publicWebOrigin,paths,false),{
   headers: {
    'content-type': 'application/xml; charset=utf-8',
   },
  });
 }catch(cause){publicFailure(cause,locals.locale);}
};

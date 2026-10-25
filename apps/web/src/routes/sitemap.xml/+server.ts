import {error} from '@sveltejs/kit';
import {createShowroomApiClient} from '@pianotechpros/api-client';
import {crawlerSitemap} from '@pianotechpros/client-core';
import {createTranslator} from '@pianotechpros/i18n';
import {publicWebOrigin,webConfig} from '#lib/server/config.js';
import {publicFailure} from '#lib/showroom/server.js';
import type {RequestHandler} from './$types';

export const GET:RequestHandler=async({locals,request,setHeaders})=>{
 setHeaders({'cache-control':'no-store'});
 if(!publicWebOrigin)error(503,createTranslator([locals.locale]).t('showroom.unavailable'));
 try{
  const shops=await createShowroomApiClient(webConfig.apiURL).directory(request.signal);
  return new Response(crawlerSitemap(publicWebOrigin,shops.map(shop=>'/sitemap-showroom-'+shop.slug+'.xml'),true),{
   headers: {
    'content-type': 'application/xml; charset=utf-8',
   },
  });
 }catch(cause){publicFailure(cause,locals.locale);}
};

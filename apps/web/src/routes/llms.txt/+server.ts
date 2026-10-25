import {error} from '@sveltejs/kit';
import {createShowroomApiClient} from '@pianotechpros/api-client';
import {crawlerText} from '@pianotechpros/client-core';
import {createTranslator} from '@pianotechpros/i18n';
import {publicWebOrigin,webConfig} from '#lib/server/config.js';
import {publicFailure} from '#lib/showroom/server.js';
import type {RequestHandler} from './$types';

export const GET:RequestHandler=async({locals,request,setHeaders})=>{
 setHeaders({
  'cache-control': 'no-store',
  'vary': 'Accept-Language',
 });
 const i18n=createTranslator([locals.locale]);
 if(!publicWebOrigin)error(503,i18n.t('showroom.unavailable'));
 try{
  const shops=await createShowroomApiClient(webConfig.apiURL).directory(request.signal);
  const body=crawlerText(publicWebOrigin,shops,{introduction:i18n.t('showroom.discovery.introduction'),sitemap:i18n.t('showroom.discovery.sitemap'),showrooms:i18n.t('showroom.discovery.showrooms')});
  return new Response(body,{
   headers: {
    'content-type': 'text/plain; charset=utf-8',
   },
  });
 }catch(cause){publicFailure(cause,locals.locale);}
};

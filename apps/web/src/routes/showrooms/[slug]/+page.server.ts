import {error} from '@sveltejs/kit';
import {createShowroomApiClient} from '@pianotechpros/api-client';
import {showroomFilters,type ShowroomFilterFields} from '@pianotechpros/client-core';
import {createTranslator} from '@pianotechpros/i18n';
import {webConfig} from '#lib/server/config.js';
import {publicFailure} from '#lib/showroom/server.js';
import type {PageServerLoad} from './$types';

export const load:PageServerLoad=async({params,url,locals,setHeaders,request})=>{
 setHeaders({'cache-control':'no-store'});
 const fields:ShowroomFilterFields={};
 for(const key of ['search','form','availability','currency','minimum','maximum','cursor'] as const){const values=url.searchParams.getAll(key);if(values.length>1)error(400,createTranslator([locals.locale]).t('showroom.invalidFilters'));if(values.length)fields[key]=values[0];}
 let filters;
 try{filters=showroomFilters(fields,locals.locale==='es'?',':'.');}catch{error(400,createTranslator([locals.locale]).t('showroom.invalidFilters'));}
 try{
  const page=await createShowroomApiClient(webConfig.apiURL).list(params.slug,filters,request.signal);
  const next=new URL(url);next.searchParams.delete('cursor');if(page.nextCursor)next.searchParams.set('cursor',page.nextCursor);
  return {page,fields,nextHref:page.nextCursor?next.pathname+next.search:null};
 }catch(cause){publicFailure(cause,locals.locale);}
};

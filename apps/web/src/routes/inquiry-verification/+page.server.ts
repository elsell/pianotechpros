import {error} from '@sveltejs/kit';
import {createTranslator} from '@pianotechpros/i18n';
import {inquiryConfig} from '#lib/server/config.js';
import type {PageServerLoad} from './$types';
export const load:PageServerLoad=({locals,setHeaders,url})=>{
 setHeaders({'cache-control':'no-store','x-robots-tag':'noindex,nofollow'});
 if(inquiryConfig.policy!=='enabled'||url.searchParams.getAll('siteKey').length!==1||url.searchParams.get('siteKey')!==inquiryConfig.siteKey)error(503,createTranslator([locals.locale]).t('inquiry.unavailable'));
 return {siteKey:inquiryConfig.siteKey,locale:locals.locale};
};

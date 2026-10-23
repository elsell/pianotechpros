import {createShowroomApiClient} from '@pianotechpros/api-client';
import {webConfig} from '$lib/server/config';
import {publicFailure} from '$lib/showroom/server';
import type {PageServerLoad} from './$types';
export const load:PageServerLoad=async({params,locals,setHeaders,request})=>{
 setHeaders({'cache-control':'no-store'});
 try{return await createShowroomApiClient(webConfig.apiURL).listing(params.slug,params.id,request.signal);}catch(cause){publicFailure(cause,locals.locale);}
};

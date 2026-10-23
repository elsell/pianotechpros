import {error} from '@sveltejs/kit';
import {ShowroomClientError} from '@pianotechpros/api-client';
import {createTranslator,type SupportedLocale} from '@pianotechpros/i18n';

export function publicFailure(cause:unknown,locale:SupportedLocale):never {
 const i18n=createTranslator([locale]);
 const code=cause instanceof ShowroomClientError?cause.code:'unavailable';
 if(code==='not_found')error(404,i18n.t('showroom.notFound'));
 if(code==='invalid_query')error(400,i18n.t('showroom.invalidFilters'));
 error(503,i18n.t('showroom.unavailable'));
}

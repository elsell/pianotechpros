import type { LayoutServerLoad } from './$types';
import { webConfig, inquiryConfig } from '#lib/server/config.js';

export const load = (({ locals }) => ({ locale: locals.locale, config: webConfig, inquiryConfig })) satisfies LayoutServerLoad;

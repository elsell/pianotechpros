import type { LayoutServerLoad } from './$types';
import { webConfig } from '#lib/server/config.js';

export const load = (({ locals }) => ({ locale: locals.locale, config: webConfig })) satisfies LayoutServerLoad;

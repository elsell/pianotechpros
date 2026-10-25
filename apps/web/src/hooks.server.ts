import type { Handle } from '@sveltejs/kit/hooks';
import { selectLocale } from '@pianotechpros/i18n';
import { webConfig, inquiryConfig } from '#lib/server/config.js';

export const handle: Handle = async ({ event, resolve }) => {
  const { apiURL, oidcIssuer } = webConfig;
  const accepted = (event.request.headers.get('accept-language') ?? '')
    .split(',')
    .map((entry, index) => {
      const [tag, ...parameters] = entry.split(';').map((part) => part.trim());
      const qualityParameter = parameters.find((parameter) => parameter.startsWith('q='));
      const qualityText = qualityParameter?.slice(2);
      const quality = qualityText === undefined
        ? 1
        : /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(qualityText)
          ? Number(qualityText)
          : 0;
      return { tag, quality, index };
    })
    .filter(({ tag, quality }) => tag !== '*' && quality > 0)
    .sort((left, right) => right.quality - left.quality || left.index - right.index)
    .map(({ tag }) => tag);
  event.locals.locale = selectLocale(accepted);
  const response = await resolve(event, {
    transformPageChunk: ({ html }) => html.replace('lang="en"', `lang="${event.locals.locale}"`)
  });
  response.headers.append('Vary', 'Accept-Language');
  const connectOrigins = new Set<string>(["'self'"]);
  for (const configured of [apiURL, oidcIssuer]) connectOrigins.add(new URL(configured).origin);
  const generatedCSP = response.headers.get('Content-Security-Policy');
  let csp = generatedCSP?.replace(/connect-src [^;]+/, ['connect-src', ...connectOrigins].join(' ')) ?? "default-src 'none'";
  if (generatedCSP && inquiryConfig.policy === 'enabled') {
    csp = csp.replace(/script-src ([^;]+)/, 'script-src $1 https://challenges.cloudflare.com');
    csp += '; frame-src https://challenges.cloudflare.com';
  }
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  return response;
};

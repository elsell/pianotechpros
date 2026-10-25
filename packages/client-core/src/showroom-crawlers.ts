/** Callers supply the configured public web origin, never request headers. */
function checkedOrigin(value: string): string {
  const url = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (value !== url.origin || url.username || url.password ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))) {
    throw new Error('invalid_crawler_origin');
  }
  return value;
}

export function crawlerRobots(origin: string | null): string {
  if (origin === null) return 'User-agent: *\nDisallow: /\n';
  return 'User-agent: *\nDisallow: /\nAllow: /showrooms/\nAllow: /_app/\nAllow: /sitemap.xml\nAllow: /sitemap-showroom-\nAllow: /llms.txt\nSitemap: ' + checkedOrigin(origin) + '/sitemap.xml\n';
}

const slug = '[A-Za-z0-9_-]{1,80}';
const listing = '[A-Za-z0-9_-]{1,133}';
const publicPath = new RegExp('^/showrooms/' + slug + '(?:/pianos/' + listing + ')?$');
const sitemapPath = new RegExp('^/sitemap-showroom-' + slug + '\\.xml$');
function xmlEscape(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

/** Serializes an already authorized public discovery projection; never truncates. */
export function crawlerSitemap(origin: string, paths: readonly string[], index: boolean): string {
  checkedOrigin(origin);
  if (paths.length > 50000) throw new Error('crawler_capacity_exceeded');
  const seen = new Set<string>();
  const item = index ? 'sitemap' : 'url';
  const root = index ? 'sitemapindex' : 'urlset';
  const entries = paths.map(path => {
    if (!(index ? sitemapPath : publicPath).test(path) || seen.has(path) || (origin + path).length >= 2048) {
      throw new Error('invalid_crawler_path');
    }
    seen.add(path);
    return '<' + item + '><loc>' + xmlEscape(origin + path) + '</loc></' + item + '>';
  });
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<' + root + ' xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + entries.join('\n') + '\n</' + root + '>\n';
  if (new TextEncoder().encode(xml).byteLength > 50 * 1024 * 1024) throw new Error('crawler_capacity_exceeded');
  return xml;
}

export function crawlerText(origin:string,shops:readonly {slug:string;name:string}[],copy:{introduction:string;sitemap:string;showrooms:string}):string {
  checkedOrigin(origin);
  if(shops.length>10000)throw new Error('crawler_capacity_exceeded');
  const seen=new Set<string>();
  const lines=shops.map(shop=>{
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(shop.slug)||shop.slug.length>80||seen.has(shop.slug)||!shop.name.trim()||[...shop.name].length>200)throw new Error('invalid_crawler_shop');
    seen.add(shop.slug);
    const name=shop.name.replace(/[\p{Cc}\p{Cf}]/gu,' ').replace(/\s+/g,' ').trim().replace(/[\\`*_{}[\]()#+.!<>~:\/-]/g,'\\$&');
    return '- '+name+' — '+origin+'/showrooms/'+shop.slug;
  });
  return '# PianoTechPros\n\n'+copy.introduction+'\n\n'+copy.sitemap+': '+origin+'/sitemap.xml\n\n## '+copy.showrooms+'\n\n'+lines.join('\n')+'\n';
}

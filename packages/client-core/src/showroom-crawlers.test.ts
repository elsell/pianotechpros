import test from 'node:test';
import assert from 'node:assert/strict';
import { crawlerRobots, crawlerSitemap, crawlerText } from './showroom-crawlers.js';

const origin = 'https://pianos.example';
test('discovery text contains safe public names and configured links only',()=>{
  const copy={introduction:'Published pianos.',sitemap:'Sitemap',showrooms:'Showrooms'};
  const text=crawlerText(origin,[{slug:'workshop',name:'[Visit](https://evil.example)\n# <script>\u009bcontrol\u202ebidi'}],copy);
  assert.ok(text.includes(origin+'/sitemap.xml'));
  assert.ok(text.includes(origin+'/showrooms/workshop'));
  assert.equal(text.includes('[Visit]('),false);assert.equal(text.includes('<script>'),false);assert.equal(text.includes('\n# <'),false);assert.equal(/[\u009b\u202e]/u.test(text),false);
  assert.throws(()=>crawlerText(origin,[{slug:'../private',name:'Private'}],copy));
  assert.throws(()=>crawlerText(origin,[{slug:'workshop',name:'A'},{slug:'workshop',name:'B'}],copy));
});
test('robots advertises only configured public discovery and fails closed without an origin', () => {
  assert.equal(crawlerRobots(null), 'User-agent: *\nDisallow: /\n');
  const robots = crawlerRobots(origin);
  assert.ok(robots.includes('Allow: /showrooms/\n'));
  assert.ok(robots.includes('Allow: /_app/\n'));
  assert.ok(robots.includes('Disallow: /\n'));
  assert.ok(robots.includes('Sitemap: https://pianos.example/sitemap.xml\n'));
  for (const value of ['https://user:password@pianos.example', origin + '/path', origin + '?token=secret', origin + '\nInjected: true']) {
    assert.throws(() => crawlerRobots(value));
  }
});
test('sitemaps serialize only canonical same-origin public paths, with XML escaping', () => {
  const xml = crawlerSitemap(origin, ['/showrooms/a', '/showrooms/a/pianos/piano_1'], false);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'));
  assert.ok(xml.includes('<loc>https://pianos.example/showrooms/a/pianos/piano_1</loc>'));
  assert.equal(xml.includes('lastmod'), false);
  const index = crawlerSitemap(origin, ['/sitemap-showroom-a.xml'], true);
  assert.ok(index.includes('<sitemapindex '));
  assert.ok(index.includes('<sitemap><loc>'));
  assert.ok(crawlerSitemap(origin, [], false).endsWith('</urlset>\n'));
});
test('crawler output rejects injected, private, ambiguous or oversized paths instead of truncating', () => {
  for (const path of ['/inventory', '//evil.example/showrooms/a', '/showrooms/a?token=secret', '/showrooms/a#secret', '/showrooms/a/../private', '/showrooms/a%2fb', '/showrooms/a\n', '/showrooms/a/pianos/x/sitemap.xml']) {
    assert.throws(() => crawlerSitemap(origin, [path], false), path);
  }
  assert.throws(() => crawlerSitemap(origin, ['/showrooms/a'], true));
  assert.throws(() => crawlerSitemap(origin, ['/sitemap-showroom-a.xml'], false));
  assert.throws(() => crawlerSitemap(origin, ['/showrooms/a', '/showrooms/a'], false));
  assert.throws(() => crawlerSitemap(origin, Array.from({length: 50001}, (_, i) => '/showrooms/s' + i), false));
  assert.throws(() => crawlerSitemap(origin, ['/showrooms/' + 'a'.repeat(2100)], false));
});

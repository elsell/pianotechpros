import assert from 'node:assert/strict';
import test from 'node:test';
import { createTranslator, selectLocale } from './index';

test('selects supported base locales and falls back safely', () => {
  assert.equal(selectLocale(['es-MX']), 'es');
  assert.equal(selectLocale(['zz-ZZ']), 'en');
  assert.equal(selectLocale([]), 'en');
});

test('translates interpolation and plurals', () => {
  const translator = createTranslator(['es-MX']);
  assert.equal(translator.t('auth.signedInAs', { name: 'Ada' }), 'Sesión iniciada como Ada');
  assert.equal(translator.t('examples.count', { count: 1 }), '1 ejemplo');
  assert.equal(translator.t('examples.count', { count: 2 }), '2 ejemplos');
});

test('formats numbers and dates with the selected locale', () => {
  const translator = createTranslator(['es']);
  const date = new Date('2026-01-02T12:00:00Z');
  const dateOptions = { dateStyle: 'medium', timeZone: 'UTC' } as const;
  assert.equal(translator.number(1234.5), new Intl.NumberFormat('es').format(1234.5));
  assert.equal(translator.date(date, dateOptions), new Intl.DateTimeFormat('es', dateOptions).format(date));
});

test('currency review preserves exact safe minor units and currency precision',()=>{
 const en=createTranslator(['en']),es=createTranslator(['es']);
 assert.equal(en.money(9007199254740991,'USD'),'$90,071,992,547,409.91');
 assert.equal(es.money(9007199254740991,'USD'),'90.071.992.547.409,91\u00a0US$');
 assert.equal(en.money(9007199254740991,'JPY'),'¥9,007,199,254,740,991');
 assert.equal(en.money(9007199254740991,'KWD'),'KWD\u00a09,007,199,254,740.991');
 assert.equal(en.money(1200,'JPY'),'¥1,200');assert.equal(en.money(0,'USD'),'$0.00');
 for(const amount of [-1,NaN,9007199254740992])assert.throws(()=>en.money(amount,'USD'));
});

test('history copy interpolates revisions and origins in each supported locale',()=>{
 for(const locale of ['en','es']){
  const i18n=createTranslator([locale]);
  assert.ok(i18n.t('history.revision',{number:'17'}).includes('17'));
  const origin=i18n.t('history.fieldOrigin',{field:'Steinway',origin:'voice'});
  assert.ok(origin.includes('Steinway')&&origin.includes('voice'));
  assert.ok(!/[{}]/.test(origin));
 }
});

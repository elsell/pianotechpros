import assert from 'node:assert/strict';
import test from 'node:test';
import { createDeviceTranslator } from './i18n';

test('uses the Expo device locale list for translated rendering', () => {
  const translator = createDeviceTranslator(() => [{ languageTag: 'es-MX' }]);
  assert.equal(translator.locale, 'es');
  assert.equal(translator.t('auth.signIn'), 'Iniciar sesión');
  assert.equal(translator.t('examples.count', { count: 2 }), '2 ejemplos');
});

test('falls back when the device reports no supported locale', () => {
  const translator = createDeviceTranslator(() => [{ languageTag: 'zz-ZZ' }]);
  assert.equal(translator.locale, 'en');
  assert.equal(translator.t('auth.signIn'), 'Sign in');
});

test('public asking-price labels include the exact localized amount',()=>{
 for(const [locale,expected] of [['en','Asking price: $1,250.00'],['es','Precio de venta: 1250,00 US$']] as const){
  const translator=createDeviceTranslator(()=>[{languageTag:locale}]);
  const price=translator.money(125000,'USD');
  assert.equal(translator.t('showroom.priceLabel',{price}),expected);
 }
});

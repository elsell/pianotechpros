import assert from 'node:assert/strict';
import test from 'node:test';
import { redirectSystemPath } from '../app/+native-intent';

for (const initial of [false, true]) {
  test(`authentication callback is navigation-only with initial=${initial}`, () => {
    for (const path of [
      'pianotechpros://callback?code=synthetic&state=synthetic',
      'pianotechpros://callback?error=access_denied&error_description=private',
      'pianotechpros://callback?redirect_uri=https://example.com#private',
      'pianotechpros:///callback?code=synthetic',
      '/callback?code=synthetic', '/callback#private', '/callback',
    ]) assert.equal(redirectSystemPath({ path, initial }), '/');
  });
  test(`unrelated and lookalike routes are not authentication callbacks with initial=${initial}`, () => {
    for (const path of ['/inventory/record-1', '/dealers/staff',
      'pianotechpros://inventory/record-1', '/callback-extra',
      '/callback/child', 'other://callback', 'https://example.com/callback',
      'pianotechpros://callback.evil?code=synthetic', 'not a URL', '']) {
      assert.equal(redirectSystemPath({ path, initial }), path);
    }
  });
}

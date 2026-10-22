import { describe,expect,it } from 'vitest';
import { oauthCallbackFailed } from '../src/accounts/oauth';
describe('OAuth callbacks',() => {
  it('recognizes a cancelled or rejected callback without rendering server-supplied text',() => {
    expect(oauthCallbackFailed('https://example.test/Crux/#error=access_denied&error_description=untrusted')).toBe(true);
    expect(oauthCallbackFailed('https://example.test/Crux/?error_code=access_denied')).toBe(true);
    expect(oauthCallbackFailed('https://example.test/Crux/#access_token=test&type=bearer')).toBe(false);
    expect(oauthCallbackFailed('https://example.test/Crux/')).toBe(false);
    expect(oauthCallbackFailed('not a url')).toBe(false);
  });
});

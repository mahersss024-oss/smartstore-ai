import { afterEach, describe, expect, it } from 'vitest';
import { routing } from '@/libs/I18nRouting';
import { getBaseUrl, getI18nPath } from './Helpers';

describe('Helpers', () => {
  describe('I18n path helper', () => {
    it('keeps path unchanged when locale is default', () => {
      const url = '/random-url';
      const locale = routing.defaultLocale;

      expect(getI18nPath(url, locale)).toBe(url);
    });

    it('prefixes path with locale when locale is not default', () => {
      const url = '/random-url';
      const locale = 'fr';

      expect(getI18nPath(url, locale)).toBe(`/fr${url}`);
    });
  });

  describe('getBaseUrl', () => {
    afterEach(() => {
      delete process.env.NEXT_PUBLIC_APP_URL;
    });

    it('returns localhost when NEXT_PUBLIC_APP_URL is not set', () => {
      delete process.env.NEXT_PUBLIC_APP_URL;

      expect(getBaseUrl()).toBe('http://localhost:3000');
    });

    it('returns the configured app URL when NEXT_PUBLIC_APP_URL is set', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://mystore.example.com';

      expect(getBaseUrl()).toBe('https://mystore.example.com');
    });
  });
});

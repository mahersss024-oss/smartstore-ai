import { describe, expect, it } from 'vitest';
import {
  getStoreBrandThemeCssVariables,
  isValidHexColor,
  normalizeStoreBrandTheme,
} from './StoreBrandTheme';

describe('StoreBrandTheme', () => {
  it('validates only six-digit hex colors', () => {
    expect(isValidHexColor('#12AbEf')).toBe(true);
    expect(isValidHexColor('#fff')).toBe(false);
    expect(isValidHexColor('12abef')).toBe(false);
  });

  it('normalizes valid colors and drops invalid metadata', () => {
    expect(normalizeStoreBrandTheme({
      accentColor: ' #ABCDEF ',
      backgroundColor: 123,
      primaryColor: 'invalid',
    })).toEqual({
      accentColor: '#abcdef',
      backgroundColor: undefined,
      primaryColor: undefined,
    });
    expect(normalizeStoreBrandTheme(null)).toEqual({
      accentColor: undefined,
      backgroundColor: undefined,
      primaryColor: undefined,
    });
  });

  it('builds readable CSS variables for dark and light primary colors', () => {
    expect(getStoreBrandThemeCssVariables({
      accentColor: '#00ff00',
      backgroundColor: '#fefefe',
      primaryColor: '#ffffff',
    })).toEqual({
      '--accent': '#00ff00',
      '--background': '#fefefe',
      '--card': '#fefefe',
      '--primary': '#ffffff',
      '--primary-foreground': '#111827',
      '--ring': '#ffffff',
      '--secondary': '#00ff00',
    });
    expect(getStoreBrandThemeCssVariables({
      primaryColor: '#000000',
    })).toMatchObject({
      '--primary-foreground': '#ffffff',
    });
    expect(getStoreBrandThemeCssVariables({})).toBeUndefined();
  });
});

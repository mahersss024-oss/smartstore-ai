import { describe, expect, it } from 'vitest';
import {
  extractGoogleMapsCoordinates,
  isValidGoogleMapsUrl,
} from './GoogleMaps';

describe('GoogleMaps', () => {
  it.each([
    'https://maps.app.goo.gl/example',
    'https://www.google.com/maps?q=28.3838,36.5662',
    'https://maps.google.com.sa/maps?q=28.3838,36.5662',
    'https://goo.gl/maps/example',
  ])('accepts a trusted Google Maps URL: %s', (url) => {
    expect(isValidGoogleMapsUrl(url)).toBe(true);
  });

  it.each([
    'http://maps.google.com/maps?q=28.3838,36.5662',
    'https://evilgoogle.com/maps?q=28.3838,36.5662',
    'https://google.com.evil.example/maps?q=28.3838,36.5662',
    'https://maps.app.goo.gl.evil.example/test',
    'javascript:alert(1)',
  ])('rejects an untrusted map URL: %s', (url) => {
    expect(isValidGoogleMapsUrl(url)).toBe(false);
  });

  it('extracts valid coordinates from a trusted URL payload', () => {
    expect(extractGoogleMapsCoordinates(
      'https://www.google.com/maps?q=28.3838,36.5662',
    )).toEqual({
      latitude: 28.3838,
      longitude: 36.5662,
    });
  });

  it('rejects a completely invalid URL string passed to isValidGoogleMapsUrl', () => {
    expect(isValidGoogleMapsUrl('not a url at all')).toBe(false);
  });

  it('returns undefined when no valid coordinates are found in the URL', () => {
    expect(extractGoogleMapsCoordinates('https://maps.app.goo.gl/NoCoords')).toBeUndefined();
  });

  it('returns undefined for a non-URL string passed to extractGoogleMapsCoordinates', () => {
    expect(extractGoogleMapsCoordinates('just plain text')).toBeUndefined();
  });

  it('extracts coordinates from the pathname using @ notation', () => {
    expect(extractGoogleMapsCoordinates(
      'https://www.google.com/maps/@24.7136,46.6753,15z',
    )).toEqual({ latitude: 24.7136, longitude: 46.6753 });
  });

  it('extracts coordinates from the query parameter named query', () => {
    expect(extractGoogleMapsCoordinates(
      'https://www.google.com/maps?query=24.68,46.72',
    )).toEqual({ latitude: 24.68, longitude: 46.72 });
  });
});

const isHostOrSubdomain = (hostname: string, expectedHost: string) => {
  return hostname === expectedHost || hostname.endsWith(`.${expectedHost}`);
};

export const isValidGoogleMapsUrl = (value: string) => {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();

    return url.protocol === 'https:'
      && (
        host === 'maps.app.goo.gl'
        || isHostOrSubdomain(host, 'google.com')
        || isHostOrSubdomain(host, 'google.com.sa')
        || isHostOrSubdomain(host, 'goo.gl')
      );
  } catch {
    return false;
  }
};

export const extractGoogleMapsCoordinates = (value: string) => {
  try {
    const url = new URL(value);
    const candidates = [
      url.searchParams.get('query'),
      url.searchParams.get('q'),
      url.pathname,
      value,
    ].filter((candidate): candidate is string => Boolean(candidate));

    for (const candidate of candidates) {
      const match = candidate.match(/@?(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/);

      if (!match?.[1] || !match[2]) {
        continue;
      }

      const latitude = Number(match[1]);
      const longitude = Number(match[2]);

      if (
        Number.isFinite(latitude)
        && Number.isFinite(longitude)
        && latitude >= -90
        && latitude <= 90
        && longitude >= -180
        && longitude <= 180
      ) {
        return { latitude, longitude };
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
};

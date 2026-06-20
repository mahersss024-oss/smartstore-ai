export type StoreBrandTheme = {
  accentColor?: string;
  backgroundColor?: string;
  primaryColor?: string;
};

const hexColorPattern = /^#[0-9a-f]{6}$/i;

export const isValidHexColor = (value: string) => {
  return hexColorPattern.test(value);
};

const normalizeHexColor = (value: unknown) => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const color = value.trim();

  return isValidHexColor(color) ? color.toLowerCase() : undefined;
};

export const normalizeStoreBrandTheme = (value: unknown): StoreBrandTheme => {
  const theme = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};

  return {
    accentColor: normalizeHexColor(theme.accentColor),
    backgroundColor: normalizeHexColor(theme.backgroundColor),
    primaryColor: normalizeHexColor(theme.primaryColor),
  };
};

const getReadableTextColor = (background: string) => {
  if (!isValidHexColor(background)) {
    return '#ffffff';
  }

  const red = Number.parseInt(background.slice(1, 3), 16);
  const green = Number.parseInt(background.slice(3, 5), 16);
  const blue = Number.parseInt(background.slice(5, 7), 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;

  return luminance > 0.62 ? '#111827' : '#ffffff';
};

export const getStoreBrandThemeCssVariables = (value: unknown) => {
  const theme = normalizeStoreBrandTheme(value);
  const variables: Record<string, string> = {};

  if (theme.primaryColor) {
    variables['--primary'] = theme.primaryColor;
    variables['--primary-foreground'] = getReadableTextColor(theme.primaryColor);
    variables['--ring'] = theme.primaryColor;
  }

  if (theme.accentColor) {
    variables['--accent'] = theme.accentColor;
    variables['--secondary'] = theme.accentColor;
  }

  if (theme.backgroundColor) {
    variables['--background'] = theme.backgroundColor;
    variables['--card'] = theme.backgroundColor;
  }

  return Object.keys(variables).length > 0 ? variables : undefined;
};

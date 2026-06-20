const DEFAULT_STORE_TIME_ZONE = 'Asia/Riyadh';
const DATABASE_TIMESTAMP_WITHOUT_TIME_ZONE_PATTERN
  = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

const getSafeTimeZone = (value?: null | string) => {
  const timeZone = value?.trim() || DEFAULT_STORE_TIME_ZONE;

  try {
    new Intl.DateTimeFormat('en', { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return DEFAULT_STORE_TIME_ZONE;
  }
};

const normalizeDateTimeValue = (value: Date | string) => {
  if (value instanceof Date) {
    return value;
  }

  const trimmed = value.trim();

  if (DATABASE_TIMESTAMP_WITHOUT_TIME_ZONE_PATTERN.test(trimmed)) {
    return `${trimmed.replace(' ', 'T')}Z`;
  }

  return trimmed;
};

export const formatDateTime = (
  value: Date | null | string | undefined,
  locale: string,
  timeZone?: null | string,
) => {
  if (!value) {
    return null;
  }

  const normalizedValue = normalizeDateTimeValue(value);
  const date = normalizedValue instanceof Date ? normalizedValue : new Date(normalizedValue);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: getSafeTimeZone(timeZone),
  }).format(date);
};

export const formatDatabaseDateTime = (
  value: Date | null | string | undefined,
  locale: string,
  timeZone?: null | string,
) => {
  if (!value) {
    return null;
  }

  return formatDateTime(value, locale, timeZone ?? DEFAULT_STORE_TIME_ZONE);
};

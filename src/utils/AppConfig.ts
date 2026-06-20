import type { LocalizationResource } from '@clerk/shared/types';
import type { LocalePrefixMode } from 'next-intl/routing';
import type { AppLocale } from '@/types/I18n';
import { arSA, enUS, frFR } from '@clerk/localizations';

/** Locale prefix strategy for next-intl routing. */
const localePrefix: LocalePrefixMode = 'as-needed';
const locales = [
  {
    id: 'en',
    name: 'English',
  },
  {
    id: 'fr',
    name: 'Français',
  },
  {
    id: 'ar',
    name: 'العربية',
  },
] satisfies AppLocale[];

/** Centralized application configuration */
export const AppConfig = {
  name: 'SmartStore AI',
  copyrightYear: 2026,
  i18n: {
    locales,
    defaultLocale: 'ar',
    localePrefix,
  },
  email: {
    support: 'support@smartstore.ai',
  },
} as const;

const supportedLocales: Record<string, LocalizationResource> = {
  en: enUS,
  fr: frFR,
  ar: arSA,
};

export const ClerkLocalizations = {
  defaultLocale: arSA,
  supportedLocales,
};

export const AllLocales = AppConfig.i18n.locales.map(locale => locale.id);

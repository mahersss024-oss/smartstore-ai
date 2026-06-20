import { ClerkProvider } from '@clerk/nextjs';
import { ui } from '@clerk/ui';
import { shadcn } from '@clerk/ui/themes';
import { ClerkLocalizations } from '@/utils/AppConfig';
import { getI18nPath } from '@/utils/Helpers';

export default async function AuthLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;

  const clerkLocale = ClerkLocalizations.supportedLocales[locale] ?? ClerkLocalizations.defaultLocale;
  const dashboardUrl = getI18nPath('/dashboard', locale);
  const homeUrl = getI18nPath('/', locale);
  const onboardingUrl = getI18nPath('/onboarding/organization-selection', locale);

  return (
    <ClerkProvider
      ui={ui}
      appearance={{
        cssLayerName: 'clerk',
        theme: shadcn,
        options: {
          logoPlacement: 'none',
          logoLinkUrl: homeUrl,
          unsafe_disableDevelopmentModeWarnings: true,
        },
        variables: {
          borderRadius: '0.75rem',
          colorBackground: 'oklch(0.998 0.003 230 / 94%)',
          colorForeground: 'oklch(0.18 0.045 248)',
          colorPrimary: 'oklch(0.53 0.19 242)',
        },
        elements: {
          cardBox: {
            border: '1px solid oklch(0.8 0.043 235 / 66%)',
            boxShadow: '0 24px 80px oklch(0.29 0.07 245 / 12%)',
          },
          footerPages: {
            display: 'none',
          },
        },
      }}
      localization={clerkLocale}
      signInUrl={getI18nPath('/sign-in', locale)}
      signUpUrl={getI18nPath('/sign-up', locale)}
      signInFallbackRedirectUrl={dashboardUrl}
      signUpFallbackRedirectUrl={onboardingUrl}
      afterSignOutUrl={getI18nPath('/', locale)}
    >
      {props.children}
    </ClerkProvider>
  );
}

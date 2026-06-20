import type { Metadata } from 'next';
import { SignIn } from '@clerk/nextjs';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getI18nPath } from '@/utils/Helpers';

type SignInPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata(props: SignInPageProps): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({
    locale,
    namespace: 'SignIn',
  });

  return {
    title: t('meta_title'),
    description: t('meta_description'),
  };
}

export default async function SignInPage(props: SignInPageProps) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const t = await getTranslations({
    locale,
    namespace: 'SignIn',
  });
  const dashboardUrl = getI18nPath('/dashboard', locale);
  const onboardingUrl = getI18nPath('/onboarding/organization-selection', locale);

  return (
    <div className="grid w-full max-w-md gap-5">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-normal">
          {t('meta_title')}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t('meta_description')}
        </p>
      </div>

      <SignIn
        routing="hash"
        fallbackRedirectUrl={dashboardUrl}
        signUpFallbackRedirectUrl={onboardingUrl}
      />
    </div>
  );
};

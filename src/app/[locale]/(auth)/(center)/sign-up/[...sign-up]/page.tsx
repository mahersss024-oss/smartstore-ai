import type { Metadata } from 'next';
import { SignUp } from '@clerk/nextjs';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getI18nPath } from '@/utils/Helpers';

type SignUpPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata(props: SignUpPageProps): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({
    locale,
    namespace: 'SignUp',
  });

  return {
    title: t('meta_title'),
    description: t('meta_description'),
  };
}

export default async function SignUpPage(props: SignUpPageProps) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const t = await getTranslations({
    locale,
    namespace: 'SignUp',
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

      <SignUp
        path={getI18nPath('/sign-up', locale)}
        fallbackRedirectUrl={onboardingUrl}
        signInFallbackRedirectUrl={dashboardUrl}
      />
    </div>
  );
};

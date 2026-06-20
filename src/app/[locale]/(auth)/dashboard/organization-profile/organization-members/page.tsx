import { OrganizationProfile } from '@clerk/nextjs';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { TitleBar } from '@/features/dashboard/TitleBar';

export default async function OrganizationMembersPage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const t = await getTranslations({
    locale,
    namespace: 'OrganizationProfilePage',
  });

  return (
    <>
      <TitleBar
        title={t('title_bar')}
        description={t('title_bar_description')}
      />

      <div className="dashboard-panel rounded-xl border">
        <OrganizationProfile
          appearance={{
            elements: {
              rootBox: 'w-full',
              card: 'shadow-none',
            },
          }}
        />
      </div>
    </>
  );
};

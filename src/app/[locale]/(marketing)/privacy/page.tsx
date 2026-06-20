import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LegalPage } from '@/features/marketing/LegalPage';

type PrivacyPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata(props: PrivacyPageProps): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: 'PrivacyPage' });

  return {
    title: t('meta_title'),
    description: t('meta_description'),
  };
}

export default async function PrivacyPage(props: PrivacyPageProps) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'PrivacyPage' });
  const sections = [1, 2, 3, 4, 5, 6, 7] as const;

  return (
    <LegalPage
      eyebrow={t('eyebrow')}
      title={t('title')}
      description={t('description')}
      updated={t('updated')}
      sections={sections.map(section => ({
        id: `privacy-${section}`,
        title: t(`section_${section}_title`),
        body: t(`section_${section}_body`),
      }))}
    />
  );
}

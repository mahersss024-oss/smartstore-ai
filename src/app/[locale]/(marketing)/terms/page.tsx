import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LegalPage } from '@/features/marketing/LegalPage';

type TermsPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata(props: TermsPageProps): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: 'TermsPage' });

  return {
    title: t('meta_title'),
    description: t('meta_description'),
  };
}

export default async function TermsPage(props: TermsPageProps) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'TermsPage' });
  const sections = [1, 2, 3, 4, 5] as const;

  return (
    <LegalPage
      eyebrow={t('eyebrow')}
      title={t('title')}
      description={t('description')}
      updated={t('updated')}
      sections={sections.map(section => ({
        id: `terms-${section}`,
        title: t(`section_${section}_title`),
        body: t(`section_${section}_body`),
      }))}
    />
  );
}

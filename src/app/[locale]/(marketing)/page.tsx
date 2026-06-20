import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { About } from '@/features/marketing/About';
import { CTA } from '@/features/marketing/CTA';
import { FAQ } from '@/features/marketing/FAQ';
import { Features } from '@/features/marketing/Features';
import { Footer } from '@/features/marketing/Footer';
import { Hero } from '@/features/marketing/Hero';
import { Navbar } from '@/features/marketing/Navbar';
import { Pricing } from '@/features/marketing/Pricing';

type IndexProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata(props: IndexProps): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({
    locale,
    namespace: 'Index',
  });

  return {
    title: t('meta_title'),
    description: t('meta_description'),
  };
}

export default async function Index(props: IndexProps) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  return (
    <>
      <Navbar locale={locale} />
      <Hero />
      <Features />
      <Pricing />
      <FAQ />
      <CTA />
      <About />
      <Footer />
    </>
  );
};

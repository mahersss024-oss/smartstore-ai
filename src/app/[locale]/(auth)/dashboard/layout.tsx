import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DashboardShell } from '@/features/dashboard/DashboardShell';

type DashboardLayoutProps = {
  params: Promise<{ locale: string }>;
  children: React.ReactNode;
};

export async function generateMetadata(props: DashboardLayoutProps): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({
    locale,
    namespace: 'DashboardLayout',
  });

  return {
    title: t('meta_title'),
    description: t('meta_description'),
  };
}

export default async function DashboardLayout(props: DashboardLayoutProps) {
  const { locale } = await props.params;
  return <DashboardShell locale={locale}>{props.children}</DashboardShell>;
}

export const dynamic = 'force-dynamic';

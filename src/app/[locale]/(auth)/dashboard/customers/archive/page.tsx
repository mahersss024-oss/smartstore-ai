import { redirect } from 'next/navigation';
import { getI18nPath } from '@/utils/Helpers';

export default async function ArchivedCustomersPathPage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;

  redirect(getI18nPath('/dashboard/customers?archived=1', locale));
}

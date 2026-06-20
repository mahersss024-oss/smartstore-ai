import { AlertTriangle, Home } from 'lucide-react';
import { getLocale } from 'next-intl/server';

const labelsByLocale: Record<string, {
  description: string;
  home: string;
  title: string;
}> = {
  ar: {
    description: 'الرابط غير موجود أو تم نقله. يمكنك العودة إلى الرئيسية بأمان.',
    home: 'العودة للرئيسية',
    title: 'الصفحة غير موجودة',
  },
  fr: {
    description: 'Ce lien est introuvable ou a ete deplace. Vous pouvez revenir a l accueil.',
    home: 'Retour a l accueil',
    title: 'Page introuvable',
  },
};

export default async function LocaleNotFound() {
  const requestedLocale = await getLocale();
  const locale = requestedLocale in labelsByLocale ? requestedLocale : 'ar';
  const labels = labelsByLocale[locale]!;
  const homePath = locale === 'ar' ? '/' : `/${locale}`;

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-5 py-12">
      <section className="
        w-full max-w-lg rounded-xl border bg-background p-8 text-center
        shadow-sm
      "
      >
        <div className="
          mx-auto flex size-12 items-center justify-center rounded-full
          bg-amber-500/10 text-amber-700
        "
        >
          <AlertTriangle className="size-6" />
        </div>
        <h1 className="mt-5 text-2xl font-bold">{labels.title}</h1>
        <p className="mt-3 text-sm/6 text-muted-foreground">{labels.description}</p>
        <div className="mt-6 flex justify-center">
          <a
            href={homePath}
            className="
              inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm
              font-semibold
            "
          >
            <Home className="size-4" />
            {labels.home}
          </a>
        </div>
      </section>
    </main>
  );
}

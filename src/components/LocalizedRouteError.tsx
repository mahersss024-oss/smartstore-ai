'use client';

import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import { useParams } from 'next/navigation';

type ErrorLabels = {
  description: string;
  home: string;
  retry: string;
  title: string;
};

const labelsByLocale: Record<string, {
  error: ErrorLabels;
  notFound: ErrorLabels;
}> = {
  ar: {
    error: {
      description: 'تعذر تحميل الصفحة الآن. أعد المحاولة، ولن تتأثر بياناتك المحفوظة.',
      home: 'العودة للرئيسية',
      retry: 'إعادة المحاولة',
      title: 'تعذر إكمال العملية',
    },
    notFound: {
      description: 'الرابط غير موجود أو تم نقله. يمكنك العودة إلى الرئيسية بأمان.',
      home: 'العودة للرئيسية',
      retry: 'تحديث الصفحة',
      title: 'الصفحة غير موجودة',
    },
  },
  fr: {
    error: {
      description: 'La page ne peut pas etre chargee maintenant. Reessayez; vos donnees sont conservees.',
      home: 'Retour a l accueil',
      retry: 'Reessayer',
      title: 'Operation impossible',
    },
    notFound: {
      description: 'Ce lien est introuvable ou a ete deplace. Vous pouvez revenir a l accueil.',
      home: 'Retour a l accueil',
      retry: 'Actualiser',
      title: 'Page introuvable',
    },
  },
};

export const LocalizedRouteError = (props: {
  onRetry?: () => void;
  type: 'error' | 'notFound';
}) => {
  const params = useParams<{ locale?: string }>();
  const locale = params?.locale && params.locale in labelsByLocale ? params.locale : 'ar';
  const labels = labelsByLocale[locale]![props.type];
  const homePath = locale === 'ar' ? '/' : `/${locale}`;
  const retry = props.onRetry ?? (() => window.location.reload());

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
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={retry}
            className="
              inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2
              text-sm font-semibold text-primary-foreground
            "
          >
            <RefreshCw className="size-4" />
            {labels.retry}
          </button>
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
};

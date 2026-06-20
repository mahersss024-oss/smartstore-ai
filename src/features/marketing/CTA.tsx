import { ArrowRightIcon, CheckCircledIcon } from '@radix-ui/react-icons';
import { useTranslations } from 'next-intl';
import { buttonVariants } from '@/components/ui/buttonVariants';
import { Section } from '@/features/landing/Section';
import { Link } from '@/libs/I18nNavigation';

export const CTA = () => {
  const t = useTranslations('CTA');
  const updates = [1, 2, 3] as const;

  return (
    <Section
      id="updates"
      subtitle={t('section_subtitle')}
      title={t('title')}
      description={t('description')}
    >
      <div className="
        overflow-hidden rounded-2xl border border-cyan-500/20 bg-background
        shadow-[0_20px_70px_oklch(0.42_0.08_215/10%)]
      "
      >
        <div className="
          grid
          md:grid-cols-3
        "
        >
          {updates.map(update => (
            <div
              key={update}
              className="
                border-b border-cyan-500/15 p-6
                last:border-b-0
                md:border-r md:border-b-0
                md:last:border-r-0
                rtl:md:border-r-0 rtl:md:border-l
                rtl:md:last:border-l-0
              "
            >
              <CheckCircledIcon className="mb-4 size-6 text-cyan-600" />
              <h3 className="text-lg font-bold">
                {t(`update_${update}_title`)}
              </h3>
              <p className="mt-2 text-sm/6 text-muted-foreground">
                {t(`update_${update}_description`)}
              </p>
            </div>
          ))}
        </div>

        <div className="
          flex flex-col items-center justify-between gap-4 border-t
          border-cyan-500/15 bg-cyan-500/6 px-6 py-5 text-center
          md:flex-row md:text-start
        "
        >
          <p className="text-sm font-medium text-muted-foreground">
            {t('closing_note')}
          </p>
          <Link
            className={buttonVariants({
              size: 'lg',
              className: 'whitespace-pre-line',
            })}
            href="/sign-up"
          >
            {t('button_text')}

            <ArrowRightIcon className="
              ms-1 size-5
              rtl:rotate-180
            "
            />
          </Link>
        </div>
      </div>
    </Section>
  );
};

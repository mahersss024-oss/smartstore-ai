import { useTranslations } from 'next-intl';
import { Section } from '@/features/landing/Section';

export const About = () => {
  const t = useTranslations('About');
  const highlights = [
    t('highlight_1'),
    t('highlight_2'),
    t('highlight_3'),
  ];

  return (
    <Section id="about">
      <div className="
        mx-auto max-w-5xl overflow-hidden rounded-2xl border border-cyan-500/20
        bg-linear-to-br from-background via-cyan-500/6 to-emerald-500/8
        shadow-[0_24px_80px_oklch(0.42_0.08_215/13%)]
      "
      >
        <div className="
          grid
          md:grid-cols-[0.9fr_1.1fr]
        "
        >
          <div className="
            border-b border-cyan-500/15 bg-cyan-500/8 p-6
            md:border-r md:border-b-0 md:p-8
            rtl:md:border-r-0 rtl:md:border-l
          "
          >
            <div className="
              inline-flex rounded-full border border-cyan-500/25
              bg-background/70 px-3 py-1 text-xs font-semibold text-cyan-700
              shadow-sm backdrop-blur-sm
            "
            >
              {t('eyebrow')}
            </div>
            <h2 className="mt-4 text-3xl font-bold tracking-normal">
              {t('title')}
            </h2>
            <div className="mt-6 grid gap-3">
              {highlights.map(highlight => (
                <div
                  key={highlight}
                  className="
                    rounded-lg border border-emerald-500/18 bg-background/72
                    px-4 py-3 text-sm font-medium text-foreground shadow-sm
                  "
                >
                  {highlight}
                </div>
              ))}
            </div>
          </div>

          <div className="
            space-y-4 p-6 text-sm/7 text-muted-foreground
            md:p-8
          "
          >
            <p>{t('paragraph_1')}</p>
            <p>{t('paragraph_2')}</p>
            <p className="
              rounded-xl border border-primary/15 bg-primary/6 p-4 font-medium
              text-foreground
            "
            >
              {t('paragraph_3')}
            </p>
          </div>
        </div>
      </div>
    </Section>
  );
};

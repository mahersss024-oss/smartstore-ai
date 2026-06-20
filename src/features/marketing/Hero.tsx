import type { ReactNode } from 'react';
import { ArrowRightIcon, LightningBoltIcon } from '@radix-ui/react-icons';
import { useTranslations } from 'next-intl';
import { badgeVariants } from '@/components/ui/badgeVariants';
import { buttonVariants } from '@/components/ui/buttonVariants';
import { CenteredHero } from '@/features/landing/CenteredHero';
import { Section } from '@/features/landing/Section';
import { Link } from '@/libs/I18nNavigation';

const HeroImportantText = (chunks: ReactNode) => (
  <span className="
    bg-linear-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text
    text-transparent
  "
  >
    {chunks}
  </span>
);

export const Hero = () => {
  const t = useTranslations('Hero');

  return (
    <Section id="product" className="py-36">
      <CenteredHero
        banner={(
          <a
            className={badgeVariants({
              className: 'max-w-full whitespace-normal text-center leading-relaxed',
            })}
            href="#updates"
          >
            <LightningBoltIcon />
            {' '}
            {t('follow_twitter')}
          </a>
        )}
        title={t.rich('title', { important: HeroImportantText })}
        description={t('description')}
        buttons={(
          <>
            <a
              className={buttonVariants({ variant: 'outline', size: 'lg' })}
              href="#features"
            >
              {t('secondary_button')}
            </a>

            <Link
              className={buttonVariants({ size: 'lg' })}
              href="/sign-up"
            >
              {t('primary_button')}
              <ArrowRightIcon className="
                ms-1 size-5
                rtl:rotate-180
              "
              />
            </Link>
          </>
        )}
      />
    </Section>
  );
};

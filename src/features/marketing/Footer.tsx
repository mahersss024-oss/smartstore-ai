import { useTranslations } from 'next-intl';
import { CenteredFooter } from '@/features/landing/CenteredFooter';
import { Section } from '@/features/landing/Section';
import { Link } from '@/libs/I18nNavigation';
import { AppConfig } from '@/utils/AppConfig';
import { Logo } from './Logo';

export const Footer = () => {
  const t = useTranslations('Footer');

  return (
    <Section className="pt-0 pb-16">
      <CenteredFooter
        logo={<Logo />}
        name={AppConfig.name}
        legalLinks={(
          <>
            <li>
              <Link href="/terms">{t('terms')}</Link>
            </li>
            <li>
              <Link href="/privacy">{t('privacy')}</Link>
            </li>
          </>
        )}
      >
        <li>
          <a href="#features">{t('product')}</a>
        </li>

        <li>
          <a href="#setup">{t('docs')}</a>
        </li>

        <li>
          <a href="#updates">{t('blog')}</a>
        </li>

        <li>
          <a href="#about">{t('company')}</a>
        </li>
      </CenteredFooter>
    </Section>
  );
};

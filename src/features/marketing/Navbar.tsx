import { useTranslations } from 'next-intl';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { buttonVariants } from '@/components/ui/buttonVariants';
import { CenteredMenu } from '@/features/landing/CenteredMenu';
import { Section } from '@/features/landing/Section';
import { Link } from '@/libs/I18nNavigation';
import { Logo } from './Logo';

export const Navbar = (props: {
  locale: string;
}) => {
  const t = useTranslations('Navbar');
  const localeSwitcherT = useTranslations('LocaleSwitcher');

  return (
    <Section className="px-3 py-6">
      <CenteredMenu
        logo={<Logo />}
        rightMenu={(
          <>
            <li>
              <LocaleSwitcher
                buttonLabel={localeSwitcherT('button_label')}
                locale={props.locale}
              />
            </li>
            <li className="ms-1 me-2.5">
              <Link href="/sign-in">{t('sign_in')}</Link>
            </li>
            <li>
              <Link className={buttonVariants()} href="/sign-up">
                {t('sign_up')}
              </Link>
            </li>
          </>
        )}
      >
        <li>
          <a href="#features">{t('product')}</a>
        </li>

        <li>
          <a href="#pricing">{t('pricing')}</a>
        </li>

        <li>
          <a href="#setup">{t('docs')}</a>
        </li>

        <li>
          <a href="#updates">{t('blog')}</a>
        </li>

        <li>
          <a href="#about">{t('about')}</a>
        </li>
      </CenteredMenu>
    </Section>
  );
};

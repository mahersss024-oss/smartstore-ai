import { ActiveLink } from '@/components/ActiveLink';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';

import { Separator } from '@/components/ui/separator';
import { Logo } from '@/features/marketing/Logo';
import { Link } from '@/libs/I18nNavigation';
import { DashboardUserButton } from './DashboardUserButton';
import { MobileNavigation } from './MobileNavigation';
import { OrganizationMenu } from './OrganizationMenu';
import { SlashIcon } from './SlashIcon';

const StoreHeaderLogo = (props: {
  logoUrl?: null | string;
  storeName?: null | string;
}) => {
  if (!props.logoUrl) {
    return <Logo />;
  }

  return (
    <div className="inline-flex min-w-0 items-center gap-2.5">
      <span className="
        flex size-9 shrink-0 items-center justify-center overflow-hidden
        rounded-xl border border-border bg-background
      "
      >
        {/* eslint-disable-next-line next/no-img-element -- Store logos can be merchant-provided external URLs. */}
        <img
          alt={props.storeName ?? 'Store logo'}
          src={props.logoUrl}
          className="size-full object-cover"
        />
      </span>
    </div>
  );
};

export const DashboardHeader = (props: {
  locale: string;
  menu: {
    href: string;
    label: string;
  }[];
  localeSwitcherLabel: string;
  mobileMenuLabel: string;
  storeLogoUrl?: null | string;
  storeName?: null | string;
}) => {
  return (
    <>
      <div className="flex min-w-0 items-center">
        <Link href="/dashboard" className="max-sm:hidden">
          <StoreHeaderLogo
            logoUrl={props.storeLogoUrl}
            storeName={props.storeName}
          />
        </Link>

        <SlashIcon />

        <OrganizationMenu locale={props.locale} />

        <nav
          className="
            ms-4 rounded-full border border-border/70 bg-background/65 p-1
            shadow-sm backdrop-blur-xl
            max-lg:hidden
          "
        >
          <ul className="
            flex flex-row items-center gap-x-1 text-sm font-semibold
          "
          >
            {props.menu.map(item => (
              <li key={item.href}>
                <ActiveLink href={item.href} locale={props.locale}>
                  {item.label}
                </ActiveLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="shrink-0">
        <ul className="flex items-center gap-x-1.5">
          <li className="
            hidden
            md:block
            lg:hidden
          "
          >
            <MobileNavigation
              menu={props.menu}
              label={props.mobileMenuLabel}
              locale={props.locale}
            />
          </li>

          <li>
            <LocaleSwitcher
              buttonLabel={props.localeSwitcherLabel}
              locale={props.locale}
            />
          </li>

          <li>
            <Separator orientation="vertical" className="h-4" />
          </li>

          <li>
            <DashboardUserButton locale={props.locale} />
          </li>
        </ul>
      </div>
    </>
  );
};

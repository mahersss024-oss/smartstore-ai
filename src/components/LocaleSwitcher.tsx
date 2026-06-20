'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AppConfig } from '@/utils/AppConfig';
import { getI18nPath } from '@/utils/Helpers';

const pathWithoutLocale = (pathname: string) => {
  const localePattern = AppConfig.i18n.locales
    .map(locale => locale.id)
    .join('|');
  const match = pathname.match(new RegExp(`^/(${localePattern})(?=/|$)`));

  if (!match) {
    return pathname || '/';
  }

  const withoutLocale = pathname.slice(match[0].length);

  return withoutLocale || '/';
};

export const LocaleSwitcher = (props: {
  buttonLabel: string;
  locale: string;
}) => {
  const router = useRouter();
  const pathname = usePathname();

  const handleChange = (newLocale: string) => {
    if (newLocale === props.locale) {
      return;
    }

    const { search } = window.location;
    router.push(`${getI18nPath(pathWithoutLocale(pathname), newLocale)}${search}`, {
      scroll: false,
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={props.buttonLabel}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="size-6 stroke-current stroke-2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 24 24"
          >
            <path stroke="none" d="M0 0h24v24H0z" />
            <path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0M3.6 9h16.8M3.6 15h16.8" />
            <path d="M11.5 3a17 17 0 0 0 0 18M12.5 3a17 17 0 0 1 0 18" />
          </svg>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuRadioGroup value={props.locale} onValueChange={handleChange}>
          {AppConfig.i18n.locales.map(elt => (
            <DropdownMenuRadioItem key={elt.id} value={elt.id}>
              {elt.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

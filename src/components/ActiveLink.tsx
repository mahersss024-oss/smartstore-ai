'use client';

import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { cn, getI18nPath } from '@/utils/Helpers';

export const ActiveLink = (props: {
  children: React.ReactNode;
  href: string;
  locale: string;
}) => {
  const pathname = usePathname();
  const localizedHref = getI18nPath(props.href, props.locale);
  const isActive = localizedHref === getI18nPath('/dashboard', props.locale)
    ? pathname === localizedHref
    : pathname === localizedHref || pathname.startsWith(`${localizedHref}/`);

  return (
    <NextLink
      href={localizedHref}
      className={cn(
        `
          rounded-full px-3.5 py-2 text-muted-foreground transition-all
          duration-200
          hover:-translate-y-px hover:bg-accent/80 hover:text-accent-foreground
        `,
        isActive
        && `
          bg-linear-to-r from-primary to-cyan-600 text-primary-foreground
          shadow-sm shadow-primary/25
          hover:from-primary hover:to-emerald-600 hover:text-primary-foreground
        `,
      )}
    >
      {props.children}
    </NextLink>
  );
};

'use client';

import { Menu } from 'lucide-react';
import NextLink from 'next/link';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getI18nPath } from '@/utils/Helpers';

export const MobileNavigation = (props: {
  label: string;
  locale: string;
  menu: {
    href: string;
    label: string;
  }[];
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button
        className="
          p-2
          focus-visible:ring-offset-0
        "
        variant="ghost"
        aria-label={props.label}
      >
        <Menu className="size-6" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent>
      {props.menu.map(item => (
        <DropdownMenuItem key={item.href} asChild>
          <NextLink href={getI18nPath(item.href, props.locale)}>
            {item.label}
          </NextLink>
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);

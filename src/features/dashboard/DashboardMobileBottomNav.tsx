'use client';

import { BarChart3, Home, Package, ReceiptText, Settings } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { Link } from '@/libs/I18nNavigation';

const items = [
  {
    href: '/dashboard',
    icon: Home,
    labelKey: 'home',
  },
  {
    href: '/dashboard/orders',
    icon: ReceiptText,
    labelKey: 'orders',
  },
  {
    href: '/dashboard/products',
    icon: Package,
    labelKey: 'products',
  },
  {
    href: '/dashboard/revenue',
    icon: BarChart3,
    labelKey: 'revenue',
  },
  {
    href: '/dashboard/settings',
    icon: Settings,
    labelKey: 'settings',
  },
] as const;

export const DashboardMobileBottomNav = (props: {
  ariaLabel: string;
  labels: Record<typeof items[number]['labelKey'], string>;
}) => {
  const pathname = usePathname();

  return (
    <nav
      className="
        fixed inset-x-0 bottom-0 z-50 border-t bg-background/96 px-2 pt-2
        pb-[calc(0.5rem+env(safe-area-inset-bottom))]
        shadow-[0_-10px_34px_oklch(0.29_0.08_245/12%)] backdrop-blur-sm
        md:hidden
      "
      aria-label={props.ariaLabel}
    >
      <div className="grid grid-cols-5 gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = pathname?.endsWith(item.href)
            || (item.href !== '/dashboard' && pathname?.includes(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex min-h-12 flex-col items-center justify-center gap-1
                rounded-lg px-1 text-center text-[11px] font-semibold transition
                ${isActive
              ? 'bg-primary/10 text-primary'
              : `text-muted-foreground`}
              `}
            >
              <Icon className="size-4" />
              <span className="max-w-full truncate">
                {props.labels[item.labelKey]}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

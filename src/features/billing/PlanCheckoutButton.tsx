'use client';

import { useTransition } from 'react';

type PlanCheckoutButtonProps = {
  active?: boolean;
  checkoutEnabled?: boolean;
  disabled?: boolean;
  label: string;
  planName?: string;
};

export const PlanCheckoutButton = (props: PlanCheckoutButtonProps) => {
  const [isPending, startTransition] = useTransition();
  const isDisabled = props.active || props.disabled || !props.checkoutEnabled || isPending;

  const startCheckout = () => {
    if (!props.planName || isDisabled) {
      return;
    }

    startTransition(async () => {
      const response = await fetch('/api/billing/checkout', {
        body: JSON.stringify({
          kind: 'base_plan',
          plan: props.planName,
        }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      });
      const result = await response.json() as { url?: string };

      if (response.ok && result.url) {
        window.location.assign(result.url);
      }
    });
  };

  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={startCheckout}
      className="
        inline-flex w-full items-center justify-center rounded-lg bg-primary
        px-4 py-2 text-sm font-semibold text-primary-foreground
        transition-opacity
        hover:opacity-90
        disabled:cursor-not-allowed disabled:opacity-55
      "
    >
      {props.label}
    </button>
  );
};

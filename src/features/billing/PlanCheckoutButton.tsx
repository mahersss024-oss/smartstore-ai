'use client';

import { MessageCircle } from 'lucide-react';
import { useTransition } from 'react';

type PlanCheckoutButtonProps = {
  active?: boolean;
  billingWhatsappMessage?: string;
  billingWhatsappNumber?: string;
  checkoutEnabled?: boolean;
  disabled?: boolean;
  label: string;
  planName?: string;
};

export const PlanCheckoutButton = (props: PlanCheckoutButtonProps) => {
  const [isPending, startTransition] = useTransition();
  const billingWhatsappUrl = props.billingWhatsappNumber && props.billingWhatsappMessage
    ? `https://wa.me/${props.billingWhatsappNumber}?text=${encodeURIComponent(props.billingWhatsappMessage)}`
    : null;
  const isDisabled = props.active || props.disabled || isPending;
  const isCheckoutDisabled = isDisabled || (!billingWhatsappUrl && !props.checkoutEnabled);

  const startCheckout = () => {
    if (!props.planName || isCheckoutDisabled) {
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

  if (billingWhatsappUrl && !isDisabled) {
    return (
      <a
        href={billingWhatsappUrl}
        target="_blank"
        rel="noreferrer"
        className="
          inline-flex w-full items-center justify-center gap-2 rounded-lg
          bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground
          transition-opacity
          hover:opacity-90
        "
      >
        <MessageCircle className="size-4" />
        {props.label}
      </a>
    );
  }

  return (
    <button
      type="button"
      disabled={isCheckoutDisabled}
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

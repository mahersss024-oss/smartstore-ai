'use client';

import { MessageCircle, Plus } from 'lucide-react';
import { useTransition } from 'react';

type AddOnCheckoutButtonProps = {
  addOnKey: string;
  billingWhatsappMessage?: string;
  billingWhatsappNumber?: string;
  checkoutEnabled?: boolean;
  disabled?: boolean;
  label: string;
};

export const AddOnCheckoutButton = (props: AddOnCheckoutButtonProps) => {
  const [isPending, startTransition] = useTransition();
  const billingWhatsappUrl = props.billingWhatsappNumber && props.billingWhatsappMessage
    ? `https://wa.me/${props.billingWhatsappNumber}?text=${encodeURIComponent(props.billingWhatsappMessage)}`
    : null;
  const isDisabled = props.disabled || isPending;
  const isCheckoutDisabled = isDisabled || (!billingWhatsappUrl && !props.checkoutEnabled);

  const startCheckout = () => {
    if (isCheckoutDisabled) {
      return;
    }

    startTransition(async () => {
      const response = await fetch('/api/billing/checkout', {
        body: JSON.stringify({
          addOnKey: props.addOnKey,
          kind: 'add_on',
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
        data-add-on-key={props.addOnKey}
        className="
          inline-flex dashboard-pill items-center gap-1.5 rounded-lg border px-3
          py-2 text-xs font-semibold transition-colors
          hover:bg-accent
        "
      >
        <MessageCircle className="size-3.5" />
        {props.label}
      </a>
    );
  }

  return (
    <button
      type="button"
      disabled={isCheckoutDisabled}
      data-add-on-key={props.addOnKey}
      onClick={startCheckout}
      className="
        inline-flex dashboard-pill items-center gap-1.5 rounded-lg border px-3
        py-2 text-xs font-semibold transition-colors
        hover:bg-accent
        disabled:cursor-not-allowed disabled:text-muted-foreground
        disabled:opacity-60
        disabled:hover:bg-transparent
      "
    >
      <Plus className="size-3.5" />
      {props.label}
    </button>
  );
};

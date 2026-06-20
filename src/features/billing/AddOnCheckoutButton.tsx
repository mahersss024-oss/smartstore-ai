'use client';

import { Plus } from 'lucide-react';

type AddOnCheckoutButtonProps = {
  addOnKey: string;
  disabled?: boolean;
  label: string;
};

export const AddOnCheckoutButton = (props: AddOnCheckoutButtonProps) => {
  return (
    <button
      type="button"
      disabled={props.disabled}
      data-add-on-key={props.addOnKey}
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

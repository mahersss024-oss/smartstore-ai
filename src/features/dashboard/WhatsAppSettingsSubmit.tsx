'use client';

import type { WhatsAppSettingsActionState } from './StoreSettingsActions';
import { useActionState } from 'react';

type WhatsAppSettingsSubmitProps = {
  action: (
    previousState: WhatsAppSettingsActionState,
    formData: FormData,
  ) => Promise<WhatsAppSettingsActionState>;
  errorLabel: string;
  pendingLabel: string;
  saveLabel: string;
  successLabel: string;
};

export const WhatsAppSettingsSubmit = (props: WhatsAppSettingsSubmitProps) => {
  const [state, formAction, isPending] = useActionState(
    props.action,
    { status: 'idle' } satisfies WhatsAppSettingsActionState,
  );

  return (
    <div className="
      grid w-full gap-2
      sm:justify-items-end
    "
    >
      <button
        formAction={formAction}
        type="submit"
        disabled={isPending}
        className="
          rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white
          hover:bg-emerald-800
          disabled:cursor-wait disabled:opacity-65
        "
      >
        {isPending ? props.pendingLabel : props.saveLabel}
      </button>
      {state.status !== 'idle' && (
        <p
          role="status"
          className={
            state.status === 'success'
              ? 'text-xs font-medium text-emerald-700'
              : 'text-xs font-medium text-red-600'
          }
        >
          {state.status === 'success' ? props.successLabel : props.errorLabel}
        </p>
      )}
    </div>
  );
};

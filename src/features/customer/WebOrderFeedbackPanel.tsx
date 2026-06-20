'use client';

import { MessageSquareText, Star } from 'lucide-react';
import { useCallback, useState, useSyncExternalStore, useTransition } from 'react';
import { normalizeWebOrderSourceChannel } from '@/utils/CustomerChannels';
import { cn } from '@/utils/Helpers';
import { submitWebOrderFeedback } from './WebChatActions';
import {
  getWebOrderCustomerIdServerSnapshot,
  getWebOrderCustomerIdSnapshot,
  getWebOrderThreadIdServerSnapshot,
  getWebOrderThreadIdSnapshot,
  subscribeToWebOrderGuestId,
} from './WebOrderGuestIdentity';

type WebOrderFeedbackPanelProps = {
  description: string;
  errorLabel: string;
  messageLabel: string;
  organizationId: string;
  placeholder: string;
  ratingLabel: string;
  ratingOptionalLabel: string;
  sendLabel: string;
  source: string;
  successLabel: string;
  title: string;
};

export const WebOrderFeedbackPanel = (props: WebOrderFeedbackPanelProps) => {
  const sourceChannel = normalizeWebOrderSourceChannel(props.source);
  const threadScope = `${props.organizationId}:${sourceChannel}`;
  const getThreadSnapshot = useCallback(
    () => getWebOrderThreadIdSnapshot(threadScope),
    [threadScope],
  );
  const customerId = useSyncExternalStore(
    subscribeToWebOrderGuestId,
    getWebOrderCustomerIdSnapshot,
    getWebOrderCustomerIdServerSnapshot,
  );
  const threadId = useSyncExternalStore(
    subscribeToWebOrderGuestId,
    getThreadSnapshot,
    getWebOrderThreadIdServerSnapshot,
  );
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState<number | undefined>();
  const [status, setStatus] = useState<'error' | 'idle' | 'success'>('idle');
  const [isPending, startTransition] = useTransition();

  const submitFeedback = () => {
    const feedback = message.trim();

    if ((!feedback && !rating) || !threadId || isPending) {
      return;
    }

    setStatus('idle');
    startTransition(async () => {
      const response = await submitWebOrderFeedback({
        customerExternalId: customerId || threadId,
        externalThreadId: threadId,
        message: feedback,
        organizationId: props.organizationId,
        rating,
        source: sourceChannel,
      });

      if (!response.ok) {
        setStatus('error');
        return;
      }

      setMessage('');
      setRating(undefined);
      setStatus('success');
    });
  };

  return (
    <section className="
      rounded-2xl border border-primary/15 bg-background/80 p-5 shadow-sm
      shadow-primary/10
    "
    >
      <div className="flex items-start gap-3">
        <div className="
          flex size-9 shrink-0 items-center justify-center rounded-lg
          bg-accent/70 text-primary
        "
        >
          <MessageSquareText className="size-4" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-950">
            {props.title}
          </h2>
          <p className="mt-1 text-xs/5 text-slate-600">
            {props.description}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-800">
            {props.ratingLabel}
          </span>
          <span className="text-xs text-slate-500">
            {props.ratingOptionalLabel}
          </span>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map(value => (
            <button
              key={value}
              type="button"
              disabled={isPending}
              onClick={() => setRating(current => current === value ? undefined : value)}
              className={cn(
                `
                  inline-flex h-10 items-center justify-center gap-1 rounded-lg
                  border text-sm font-semibold transition
                  disabled:cursor-not-allowed disabled:opacity-50
                `,
                rating === value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : `
                    border-primary/15 bg-background/90 text-slate-700
                    hover:border-primary/60 hover:bg-accent/70
                  `,
              )}
              aria-pressed={rating === value}
            >
              <Star className="size-3.5" />
              {value}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="web-order-feedback" className="sr-only">
          {props.messageLabel}
        </label>
        <textarea
          id="web-order-feedback"
          autoComplete="off"
          value={message}
          rows={4}
          maxLength={1000}
          disabled={isPending}
          placeholder={props.placeholder}
          onChange={event => setMessage(event.target.value)}
          className="
            min-h-24 w-full resize-none rounded-lg border border-primary/15
            bg-background/90 px-3 py-2 text-sm transition outline-none
            focus:border-primary
            disabled:cursor-not-allowed disabled:bg-accent/60
            disabled:text-slate-400
          "
        />
      </div>

      {status === 'success' && (
        <p className="mt-2 text-xs font-medium text-emerald-700">
          {props.successLabel}
        </p>
      )}
      {status === 'error' && (
        <p className="mt-2 text-xs font-medium text-red-700">
          {props.errorLabel}
        </p>
      )}

      <button
        type="button"
        onClick={submitFeedback}
        disabled={isPending || (!message.trim() && !rating) || !threadId}
        className="
          mt-3 inline-flex w-full items-center justify-center rounded-lg
          bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground
          transition
          hover:bg-primary/90
          disabled:cursor-not-allowed disabled:opacity-50
        "
      >
        {props.sendLabel}
      </button>
    </section>
  );
};

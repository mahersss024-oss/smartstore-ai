'use client';

import { MessageSquareText, Star } from 'lucide-react';
import { useState, useTransition } from 'react';
import { cn } from '@/utils/Helpers';
import { submitTrackedOrderFeedback } from './WebChatActions';

type OrderTrackingFeedbackPanelProps = {
  description: string;
  errorLabel: string;
  messageLabel: string;
  orderId: number;
  organizationId: string;
  phone: string;
  placeholder: string;
  ratingLabel: string;
  ratingOptionalLabel: string;
  sendLabel: string;
  successLabel: string;
  title: string;
};

export const OrderTrackingFeedbackPanel = (props: OrderTrackingFeedbackPanelProps) => {
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState<number | undefined>();
  const [status, setStatus] = useState<'error' | 'idle' | 'success'>('idle');
  const [isPending, startTransition] = useTransition();

  const submitFeedback = () => {
    const feedback = message.trim();

    if ((!feedback && !rating) || isPending) {
      return;
    }

    setStatus('idle');
    startTransition(async () => {
      const response = await submitTrackedOrderFeedback({
        message: feedback,
        orderId: props.orderId,
        organizationId: props.organizationId,
        phone: props.phone,
        rating,
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
    <section className="rounded-xl border bg-background p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="
          flex size-9 shrink-0 items-center justify-center rounded-lg
          bg-accent/70 text-primary
        "
        >
          <MessageSquareText className="size-4" />
        </div>
        <div>
          <h2 className="text-sm font-bold">{props.title}</h2>
          <p className="mt-1 text-xs/5 text-muted-foreground">
            {props.description}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold">{props.ratingLabel}</span>
          <span className="text-xs text-muted-foreground">
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
        <label htmlFor="order-tracking-feedback" className="sr-only">
          {props.messageLabel}
        </label>
        <textarea
          id="order-tracking-feedback"
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
        disabled={isPending || (!message.trim() && !rating)}
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

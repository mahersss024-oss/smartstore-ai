'use client';

import { QrCode, RefreshCw } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

type WhapiQrResponse = {
  channelId?: string;
  error?: string;
  pending?: boolean;
  pendingReason?: WhapiQrIssueReason;
  qrDataUrl?: string;
  retryAfterSeconds?: number;
  webhookUrl?: string;
  warnings?: WhapiQrIssueReason[];
};

type WhapiQrIssueReason
  = | 'channel_preparing'
    | 'qr_pending'
    | 'restart_pending'
    | 'subscription_expired'
    | 'temporary_unavailable'
    | 'webhook_pending';

const MAX_AUTO_RETRIES = 6;
const DEFAULT_RETRY_DELAY_SECONDS = 12;
const MAX_RETRY_DELAY_SECONDS = 30;

const normalizeRetryDelaySeconds = (value?: number) => {
  if (!Number.isFinite(value)) {
    return DEFAULT_RETRY_DELAY_SECONDS;
  }

  return Math.min(Math.max(Math.round(value ?? DEFAULT_RETRY_DELAY_SECONDS), 5), MAX_RETRY_DELAY_SECONDS);
};

export const WhapiQrConnectButton = (props: {
  buttonLabel: string;
  description?: string;
  errorLabel: string;
  issueLabels?: Partial<Record<WhapiQrIssueReason, string>>;
  pendingLabel: string;
  refreshLabel: string;
  title: string;
}) => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [noticeMessage, setNoticeMessage] = useState('');
  const [pendingMessage, setPendingMessage] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [retryDelaySeconds, setRetryDelaySeconds] = useState(0);
  const [autoRetryCount, setAutoRetryCount] = useState(0);

  const requestQr = useCallback(async (isAutoRetry = false) => {
    setIsLoading(true);
    setError('');
    setNoticeMessage('');

    try {
      const response = await fetch('/api/whapi/connect/qr', {
        credentials: 'same-origin',
        method: 'POST',
      });
      const data = await response.json() as WhapiQrResponse;

      if (response.status === 202 || data.pending) {
        setQrDataUrl('');
        const pendingReason = data.pendingReason ?? data.warnings?.[0];
        setPendingMessage(pendingReason ? props.issueLabels?.[pendingReason] ?? props.pendingLabel : props.pendingLabel);
        setRetryDelaySeconds(normalizeRetryDelaySeconds(data.retryAfterSeconds));
        setAutoRetryCount(current => isAutoRetry ? current + 1 : 0);
        router.refresh();
        return;
      }

      if (!response.ok || !data.qrDataUrl) {
        setRetryDelaySeconds(0);
        setError(data.error || props.errorLabel);
        return;
      }

      setPendingMessage('');
      setRetryDelaySeconds(0);
      setAutoRetryCount(0);
      setNoticeMessage(data.warnings?.[0] ? props.issueLabels?.[data.warnings[0]] ?? '' : '');
      setQrDataUrl(data.qrDataUrl);
      router.refresh();
    } catch {
      setRetryDelaySeconds(0);
      setError(props.errorLabel);
    } finally {
      setIsLoading(false);
    }
  }, [props.errorLabel, props.issueLabels, props.pendingLabel, router]);

  useEffect(() => {
    if (!pendingMessage || retryDelaySeconds <= 0 || autoRetryCount >= MAX_AUTO_RETRIES) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      void requestQr(true);
    }, retryDelaySeconds * 1000);

    return () => window.clearTimeout(timeoutId);
  }, [autoRetryCount, pendingMessage, requestQr, retryDelaySeconds]);

  const handleStart = async () => {
    setPendingMessage('');
    setNoticeMessage('');
    setRetryDelaySeconds(0);
    setAutoRetryCount(0);
    await requestQr(false);
  };

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
      <div className="
        flex flex-col gap-3
        sm:flex-row sm:items-start sm:justify-between
      "
      >
        <div>
          <div className="text-sm font-semibold">
            {props.title}
          </div>
          {props.description && (
            <p className="mt-1 text-xs/6 text-muted-foreground">
              {props.description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleStart}
          disabled={isLoading}
          className="
            inline-flex min-h-10 items-center justify-center gap-2 rounded-lg
            bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground
            transition
            hover:bg-primary/90
            disabled:cursor-wait disabled:opacity-65
          "
        >
          {isLoading
            ? <RefreshCw className="size-4 animate-spin" />
            : (
                <QrCode className="size-4" />
              )}
          {props.buttonLabel}
        </button>
      </div>

      {error && (
        <div className="
          mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3
          py-2 text-xs text-destructive
        "
        >
          {error}
        </div>
      )}

      {pendingMessage && (
        <div className="
          mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs
          text-amber-800
        "
        >
          {pendingMessage}
          {retryDelaySeconds > 0 && autoRetryCount < MAX_AUTO_RETRIES
            ? ` (${retryDelaySeconds}s)`
            : null}
        </div>
      )}

      {noticeMessage && !pendingMessage && (
        <div className="
          mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs
          text-amber-800
        "
        >
          {noticeMessage}
        </div>
      )}

      {qrDataUrl && (
        <div className="
          mt-4 grid gap-3
          sm:grid-cols-[180px_1fr] sm:items-center
        "
        >
          <div className="rounded-lg border bg-white p-3">
            <Image
              src={qrDataUrl}
              alt={props.title}
              width={156}
              height={156}
              unoptimized
              className="mx-auto size-[156px]"
            />
          </div>
          <button
            type="button"
            onClick={handleStart}
            disabled={isLoading}
            className="
              inline-flex min-h-10 items-center justify-center rounded-lg border
              px-4 py-2 text-sm font-semibold text-primary transition
              hover:bg-primary/10
              disabled:cursor-wait disabled:opacity-65
            "
          >
            {isLoading ? <RefreshCw className="me-2 size-4 animate-spin" /> : null}
            {props.refreshLabel}
          </button>
        </div>
      )}
    </div>
  );
};

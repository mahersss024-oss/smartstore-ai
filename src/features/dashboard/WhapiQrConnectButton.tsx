'use client';

import { QrCode, RefreshCw } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type WhapiQrResponse = {
  channelId?: string;
  error?: string;
  qrDataUrl?: string;
  webhookUrl?: string;
};

export const WhapiQrConnectButton = (props: {
  buttonLabel: string;
  description: string;
  errorLabel: string;
  refreshLabel: string;
  title: string;
}) => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');

  const handleStart = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/whapi/connect/qr', {
        credentials: 'same-origin',
        method: 'POST',
      });
      const data = await response.json() as WhapiQrResponse;

      if (!response.ok || !data.qrDataUrl) {
        setError(data.error || props.errorLabel);
        return;
      }

      setQrDataUrl(data.qrDataUrl);
      router.refresh();
    } catch {
      setError(props.errorLabel);
    } finally {
      setIsLoading(false);
    }
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
          <p className="mt-1 text-xs/6 text-muted-foreground">
            {props.description}
          </p>
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
            onClick={() => router.refresh()}
            className="
              inline-flex min-h-10 items-center justify-center rounded-lg border
              px-4 py-2 text-sm font-semibold text-primary transition
              hover:bg-primary/10
            "
          >
            {props.refreshLabel}
          </button>
        </div>
      )}
    </div>
  );
};

'use client';

import { RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, useTransition } from 'react';

export const RealtimeDashboardStatus = (props: {
  labels: {
    live: string;
    offline: string;
    sync: string;
  };
}) => {
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(true);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);
  const [isPending, startTransition] = useTransition();

  const refreshDashboard = useCallback(() => {
    if (!navigator.onLine) {
      return;
    }

    startTransition(() => {
      router.refresh();
      setLastRefreshAt(new Date());
    });
  }, [router]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      refreshDashboard();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };
    const onlineStatusSyncId = window.setTimeout(() => {
      setIsOnline(navigator.onLine);
    }, 0);
    const intervalId = window.setInterval(refreshDashboard, 30_000);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.clearTimeout(onlineStatusSyncId);
      window.clearInterval(intervalId);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshDashboard]);

  return (
    <div className="
      fixed inset-e-4 bottom-20 z-40 flex items-center gap-2 rounded-full border
      bg-background/95 px-3 py-2 text-xs font-semibold shadow-lg
      backdrop-blur-sm
      md:bottom-4
    "
    >
      {isOnline
        ? <Wifi className="size-3.5 text-emerald-600" />
        : <WifiOff className="size-3.5 text-red-600" />}
      <span>{isOnline ? props.labels.live : props.labels.offline}</span>
      <button
        type="button"
        onClick={refreshDashboard}
        disabled={!isOnline || isPending}
        className="
          inline-flex items-center gap-1 rounded-full border px-2 py-1
          disabled:cursor-not-allowed disabled:opacity-60
        "
      >
        <RefreshCw className={`
          size-3
          ${isPending ? 'animate-spin' : ''}
        `}
        />
        {props.labels.sync}
      </button>
      {lastRefreshAt && (
        <span className="
          hidden text-muted-foreground
          sm:inline
        "
        >
          {lastRefreshAt.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      )}
    </div>
  );
};

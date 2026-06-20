'use client';

import { X } from 'lucide-react';
import { useCallback, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';

export const PlatformAdminNotice = (props: {
  createdAt: string;
  description: string;
  dismissLabel: string;
  notificationKey: string;
  title: string;
}) => {
  const subscribe = useCallback((onStoreChange: () => void) => {
    window.addEventListener('storage', onStoreChange);
    window.addEventListener('platform-admin-notice-change', onStoreChange);

    return () => {
      window.removeEventListener('storage', onStoreChange);
      window.removeEventListener('platform-admin-notice-change', onStoreChange);
    };
  }, []);
  const getSnapshot = useCallback(() => {
    return localStorage.getItem(props.notificationKey) ?? 'visible';
  }, [props.notificationKey]);
  const status = useSyncExternalStore(subscribe, getSnapshot, () => 'visible');

  const dismiss = () => {
    localStorage.setItem(props.notificationKey, 'dismissed');
    window.dispatchEvent(new Event('platform-admin-notice-change'));
  };

  if (status === 'dismissed') {
    return null;
  }

  return (
    <div className="
      mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4
      text-amber-950
    "
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold">{props.title}</div>
          <p className="mt-1 text-sm/6">{props.description}</p>
        </div>
        <div className="flex items-start gap-2">
          <time className="text-xs text-amber-900/75">{props.createdAt}</time>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="
              -mt-2 size-8 text-amber-950
              hover:bg-amber-500/15 hover:text-amber-950
            "
            aria-label={props.dismissLabel}
            onClick={dismiss}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
};

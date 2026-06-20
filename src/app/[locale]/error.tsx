'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { LocalizedRouteError } from '@/components/LocalizedRouteError';

export default function LocaleError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(props.error);
  }, [props.error]);

  return <LocalizedRouteError type="error" onRetry={props.reset} />;
}

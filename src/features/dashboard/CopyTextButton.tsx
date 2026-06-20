'use client';

import { Copy } from 'lucide-react';
import { useState } from 'react';

export const CopyTextButton = (props: {
  text: string;
  label: string;
  copiedLabel: string;
  failedLabel: string;
}) => {
  const [state, setState] = useState<'copied' | 'failed' | 'idle'>('idle');
  const resetState = () => setState('idle');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(props.text);
      setState('copied');
      window.setTimeout(resetState, 1800);
    } catch {
      setState('failed');
      window.setTimeout(resetState, 2200);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="
        inline-flex min-h-10 w-full items-center justify-center gap-1.5
        rounded-lg border px-3 py-2 text-xs font-semibold text-primary
        transition
        hover:bg-primary/10
        sm:w-auto
      "
    >
      <Copy className="size-3.5" />
      {state === 'copied' && props.copiedLabel}
      {state === 'failed' && props.failedLabel}
      {state === 'idle' && props.label}
    </button>
  );
};

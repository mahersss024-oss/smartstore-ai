'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';

type PendingSubmitButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'type'> & {
  children: ReactNode;
  pendingChildren?: ReactNode;
};

export const PendingSubmitButton = ({
  children,
  className,
  disabled,
  onClick,
  pendingChildren,
  ...props
}: PendingSubmitButtonProps) => {
  const { pending } = useFormStatus();
  const [optimisticLocked, setOptimisticLocked] = useState(false);
  const submissionLockedRef = useRef(false);
  const observedFormPendingRef = useRef(false);
  const optimisticLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optimisticLockFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buttonIsBusy = pending || optimisticLocked;

  useEffect(() => {
    if (pending) {
      observedFormPendingRef.current = true;
      return;
    }

    if (observedFormPendingRef.current) {
      observedFormPendingRef.current = false;
      submissionLockedRef.current = false;
      setOptimisticLocked(false);

      if (optimisticLockFallbackTimerRef.current) {
        clearTimeout(optimisticLockFallbackTimerRef.current);
        optimisticLockFallbackTimerRef.current = null;
      }
    }
  }, [pending]);

  useEffect(() => {
    return () => {
      if (optimisticLockTimerRef.current) {
        clearTimeout(optimisticLockTimerRef.current);
      }

      if (optimisticLockFallbackTimerRef.current) {
        clearTimeout(optimisticLockFallbackTimerRef.current);
      }
    };
  }, []);

  return (
    <button
      {...props}
      type="submit"
      disabled={disabled || buttonIsBusy}
      aria-busy={buttonIsBusy}
      className={`
        ${className ?? ''}
        disabled:cursor-not-allowed disabled:opacity-60
      `}
      onClick={(event) => {
        if (submissionLockedRef.current) {
          event.preventDefault();
          return;
        }

        onClick?.(event);

        if (!event.defaultPrevented) {
          submissionLockedRef.current = true;

          if (optimisticLockTimerRef.current) {
            clearTimeout(optimisticLockTimerRef.current);
          }

          if (optimisticLockFallbackTimerRef.current) {
            clearTimeout(optimisticLockFallbackTimerRef.current);
          }

          optimisticLockTimerRef.current = setTimeout(() => {
            setOptimisticLocked(true);
            optimisticLockTimerRef.current = null;
          }, 0);

          optimisticLockFallbackTimerRef.current = setTimeout(() => {
            if (!observedFormPendingRef.current) {
              submissionLockedRef.current = false;
              setOptimisticLocked(false);
            }

            optimisticLockFallbackTimerRef.current = null;
          }, 30_000);
        }
      }}
    >
      {buttonIsBusy ? pendingChildren ?? children : children}
    </button>
  );
};

'use client';

import { useEffect, useRef, useState } from 'react';

export const ConfirmSubmitButton = (props: {
  className?: string;
  confirmLabel: string;
  label: string;
}) => {
  const [isArmed, setIsArmed] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <button
      type="submit"
      className={props.className}
      onClick={(event) => {
        if (isArmed) {
          return;
        }

        event.preventDefault();
        setIsArmed(true);
        timeoutRef.current = window.setTimeout(() => {
          setIsArmed(false);
          timeoutRef.current = null;
        }, 4000);
      }}
    >
      {isArmed ? props.confirmLabel : props.label}
    </button>
  );
};

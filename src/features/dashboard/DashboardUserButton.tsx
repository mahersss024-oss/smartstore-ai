'use client';

import { UserButton } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import { getI18nPath } from '@/utils/Helpers';

export const DashboardUserButton = (props: {
  locale: string;
}) => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setIsMounted(true);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  if (!isMounted) {
    return <div aria-hidden="true" className="size-9" />;
  }

  return (
    <UserButton
      showName={false}
      userProfileMode="navigation"
      userProfileUrl={getI18nPath('/dashboard/user-profile', props.locale)}
      appearance={{
        elements: {
          rootBox: 'px-2 py-1.5',
          userButtonOuterIdentifier: 'hidden',
        },
      }}
    />
  );
};

'use client';

import { OrganizationSwitcher, Show } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import { getI18nPath } from '@/utils/Helpers';

export const OrganizationMenu = (props: {
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

  // Only render OrganizationSwitcher for signed-in users to avoid Clerk's active session warning.
  // To avoid warning, 'use client' is also required.
  return (
    <Show when="signed-in">
      <OrganizationSwitcher
        organizationProfileMode="navigation"
        organizationProfileUrl={getI18nPath(
          '/dashboard/organization-profile',
          props.locale,
        )}
        afterCreateOrganizationUrl={getI18nPath('/dashboard', props.locale)}
        hidePersonal
        skipInvitationScreen
        appearance={{
          elements: {
            organizationPreviewTextContainer: 'hidden',
            organizationPreviewMainIdentifier: 'sr-only',
            organizationPreviewSecondaryIdentifier: 'sr-only',
            organizationSwitcherTrigger: 'size-9 justify-center',
          },
        }}
      />
    </Show>
  );
};

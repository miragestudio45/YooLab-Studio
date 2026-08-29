'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { openDeeplinkProject } from '../lib/auth/deeplink';
import { isLoggedIn } from '../lib/auth/session';

/**
 * The site's one call to action: already logged in resolves the account's
 * project (creating one if it has none, same as the reference app) and
 * opens it in a new tab; otherwise it just goes to /login.
 */
export function StartWithYooLabButton({
  className,
  children,
  onClick,
}: {
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  const router = useRouter();

  const handleClick = () => {
    onClick?.();
    if (isLoggedIn()) {
      void openDeeplinkProject();
      return;
    }
    router.push('/login');
  };

  return (
    <button type="button" className={className} style={{ border: 'none' }} onClick={handleClick}>
      {children}
    </button>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { openDeeplinkProject } from '../lib/auth/deeplink';
import { isLoggedIn } from '../lib/auth/session';

/**
 * The site's one call to action: already logged in resolves the account's
 * project (creating one if it has none, same as the reference app) and
 * opens it in a new tab; otherwise it goes to /register.
 *
 * `/register`, not `/login`. This site's job is to turn a teacher who has never
 * heard of YooLab into one with an account, and everybody arriving on it from
 * search or a shared link is by definition in the first group. Landing them on a
 * password form for an account they do not have asked them to fail before it
 * asked them to sign up; the register screen links to `/login` for the returning
 * minority, so neither audience is stranded.
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

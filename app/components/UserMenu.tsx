'use client';

import { useEffect, useRef, useState } from 'react';
import authService from '../lib/auth/auth-service';
import { isLoggedIn } from '../lib/auth/session';
import { resetCurrentUserCache, useCurrentUser } from '../lib/auth/use-current-user';
import { showToast } from '../lib/toast';
import { StartWithYooLabButton } from './StartWithYooLabButton';

/**
 * Replaces the header's "Bắt đầu với YooLab" button once the visitor is
 * logged in: an avatar that opens a small dropdown with the account's name
 * and a logout action. Falls back to the ordinary CTA when logged out.
 */
export function UserMenu({
  variant = 'desktop',
  onNavigate,
}: {
  variant?: 'desktop' | 'mobile';
  onNavigate?: () => void;
}) {
  // Starts false to match the server-rendered HTML (no cookie access during
  // SSR), then syncs to the real cookie state once mounted on the client —
  // a lazy initializer here would read the cookie during hydration itself
  // and mismatch the server's markup.
  const [loggedIn, setLoggedIn] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Syncs from an external system (the cookie jar) that SSR cannot see —
  // exactly what an effect is for, not a case the lint rule's advice applies to.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoggedIn(isLoggedIn());
  }, []);

  // Shared across both header instances (desktop + mobile nav) via a
  // module-level cache, so the page calls StudioUserProfile/GetMine once.
  const user = useCurrentUser(loggedIn);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!loggedIn) {
    return (
      <StartWithYooLabButton className={variant === 'desktop' ? 'header-cta' : 'mobile-nav-cta'} onClick={onNavigate}>
        Bắt đầu với YooLab {variant === 'desktop' ? <span aria-hidden="true">↗</span> : '→'}
      </StartWithYooLabButton>
    );
  }

  const name = user?.fullName || 'Tài khoản';
  const initial = name.trim().charAt(0).toUpperCase() || 'Y';
  const avatarUrl = user?.imageUrl || undefined;

  const handleLogout = async () => {
    setOpen(false);
    onNavigate?.();
    try {
      await authService.logout();
    } catch {
      /* cookies are cleared locally either way, inside authService.logout */
    }
    resetCurrentUserCache();
    setLoggedIn(false);
    showToast('Đã đăng xuất');
  };

  const avatar = avatarUrl ? (
    <img className="user-menu-avatar" src={avatarUrl} alt={name} width={32} height={32} />
  ) : (
    <span className="user-menu-avatar user-menu-avatar--fallback">{initial}</span>
  );

  if (variant === 'mobile') {
    return (
      <div className="user-menu user-menu--mobile">
        <div className="user-menu-identity">
          {avatar}
          <span className="user-menu-name">{name}</span>
        </div>
        <button type="button" className="user-menu-logout" onClick={handleLogout}>
          Đăng xuất
        </button>
      </div>
    );
  }

  return (
    <div className="user-menu user-menu--desktop" ref={rootRef}>
      <button
        type="button"
        className="user-menu-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Tài khoản: ${name}`}
      >
        {avatar}
      </button>
      {open && (
        <div className="user-menu-dropdown" role="menu">
          <p className="user-menu-name">{name}</p>
          <button type="button" className="user-menu-logout" role="menuitem" onClick={handleLogout}>
            Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}

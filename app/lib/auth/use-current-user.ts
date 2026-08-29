import { useEffect, useState } from 'react';
import authService, { type UserDetail } from './auth-service';

// The header mounts two `UserMenu` instances at once (desktop + mobile nav),
// and both need the account's name/avatar. A module-level cache means the
// page still only calls StudioUserProfile/GetMine once, not once per instance.
let cachedRequest: Promise<UserDetail> | null = null;

function fetchCurrentUser(): Promise<UserDetail> {
  if (!cachedRequest) {
    cachedRequest = authService.getUserDetailRequest().catch((error) => {
      cachedRequest = null; // let the next mount retry instead of caching a failure
      throw error;
    });
  }
  return cachedRequest;
}

// Called on logout so a subsequent login fetches fresh data instead of
// reusing the previous account's cached profile.
export function resetCurrentUserCache(): void {
  cachedRequest = null;
}

export function useCurrentUser(loggedIn: boolean): UserDetail | null {
  const [user, setUser] = useState<UserDetail | null>(null);

  useEffect(() => {
    // Resets derived state when the (externally-owned) `loggedIn` prop flips off.
    if (!loggedIn) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUser(null);
      return;
    }
    let cancelled = false;
    fetchCurrentUser()
      .then((detail) => {
        if (!cancelled) setUser(detail);
      })
      .catch(() => {
        /* Session cookie exists but the profile fetch failed (e.g. backend
           not reachable) — callers fall back to a generic display. */
      });
    return () => {
      cancelled = true;
    };
  }, [loggedIn]);

  return user;
}

'use client';

import { useEffect } from 'react';
import { initApiAuth, setMemoryToken } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

/**
 * Runs once on app mount.
 * If the user had a previous session (has_session cookie present),
 * silently calls /refresh to restore the access token from the
 * httpOnly refresh-token cookie — no login prompt needed.
 */
export function AuthBootstrap() {
  const { user, setAuth } = useAuthStore();

  useEffect(() => {
    initApiAuth().then((token) => {
      if (token) {
        // Token refreshed successfully. If we have a cached user in
        // auth store (loaded from localStorage), sync the token into memory.
        setMemoryToken(token);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

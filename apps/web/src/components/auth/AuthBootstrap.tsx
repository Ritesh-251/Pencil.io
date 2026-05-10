"use client";

import { useEffect } from "react";
import { initApiAuth } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

/**
 * Runs once on app mount.
 * If the user had a previous session (has_session cookie present),
 * silently calls /refresh to restore the access token from the
 * httpOnly refresh-token cookie — no login prompt needed.
 */
export function AuthBootstrap() {
  const { user, setAuth, setToken, setAuthReady } = useAuthStore();

  useEffect(() => {
    initApiAuth().then((token) => {
      if (token) {
        // Sync the refreshed token into Zustand even if cached user metadata was
        // cleared. Room/realtime flows key off token state and can operate with a
        // null user until profile metadata is loaded again.
        if (user) {
          setAuth(user, token);
        } else {
          setToken(token);
        }
      }
      // Always signal that bootstrap is done — whether or not we got a token.
      // This unblocks any component waiting for authReady.
      setAuthReady();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

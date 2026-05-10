"use client";

import { useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { api } from "@/lib/api";

function CallbackContent() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    // Token is in the URL fragment (#token=...) so it never reaches the server,
    // never appears in Nginx logs, and is not leaked via Referer headers.
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const token = new URLSearchParams(hash.slice(1)).get("token");

    if (token) {
      // Immediately clear the fragment from the URL so the token isn't
      // visible in the address bar or accidentally captured by browser restore.
      window.history.replaceState(null, "", window.location.pathname);

      api
        .get("/api/v1/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        })
        .then((res) => {
          setAuth(res.user, token);
          router.push("/dashboard");
        })
        .catch((err) => {
          console.error("Failed to fetch user profile:", err);
          router.push("/auth/signin?error=profile_fetch_failed");
        });
    } else {
      router.push("/auth/signin?error=oauth_failed");
    }
  }, [setAuth, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FFFAF1] text-[var(--ink-soft)]">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--brand)] border-t-transparent" />
        <p className="text-[0.9rem] font-medium tracking-wide">
          Syncing your studio profile...
        </p>
      </div>
    </div>
  );
}

export default function AuthCallback() {
  return (
    <Suspense>
      <CallbackContent />
    </Suspense>
  );
}

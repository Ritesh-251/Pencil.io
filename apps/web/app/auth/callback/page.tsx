"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { api } from "@/lib/api";

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    const token = searchParams.get("token");
    if (token) {
      // Fetch the full profile now that we have the token
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
  }, [searchParams, setAuth, router]);

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

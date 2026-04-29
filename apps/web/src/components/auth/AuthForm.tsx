"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import Link from "next/link";
import Image from "next/image";

export const AuthForm = ({ type }: { type: "signin" | "signup" }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setAuth = useAuthStore((s) => s.setAuth);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload = { email, password };
      const res = await api.post(`/api/v1/auth/${type}`, payload);
      const token = res.token ?? res.accessToken;
      if (!token) {
        throw new Error(
          "Authentication succeeded but no access token was returned.",
        );
      }
      const fallbackUsername = email.split("@")[0] || "user";
      const user =
        res.user ??
        (res.userId
          ? { id: res.userId, username: fallbackUsername, email }
          : null);
      setAuth(user, token);
      window.location.href = "/dashboard";
    } catch (err: any) {
      setError(err.message || "Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell ambient-noise flex min-h-screen flex-col lg:flex-row">
      <div className="flex flex-1 items-center justify-center p-5 sm:p-8">
        <div
          className="glass animate-fade-in-up w-full max-w-[480px] rounded-[24px] p-6 sm:p-9"
          style={{
            boxShadow:
              "0 24px 56px rgba(43,35,27,.18), 0 1px 3px rgba(43,35,27,.08)",
          }}
        >
          <div className="mb-5 flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <div className="grid h-10 w-10 place-items-center rounded-[12px] border border-[rgba(26,26,26,.18)] bg-[rgba(13,91,215,.08)] p-1.5">
                <Image
                  src="/logo.svg"
                  alt="Pencil.io logo"
                  width={28}
                  height={28}
                  priority
                />
              </div>
              <span className="text-[1rem] font-bold tracking-[-0.02em]">
                Pencil.io
              </span>
            </div>
            <span className="rounded-full border border-[rgba(13,91,215,.28)] bg-[rgba(13,91,215,.1)] px-2.5 py-1 text-[0.68rem] font-semibold tracking-[0.04em] text-[var(--brand-strong)]">
              Encrypted Session
            </span>
          </div>

          <p className="m-0 text-[0.72rem] uppercase tracking-[0.12em] text-[var(--ink-soft)]">
            Realtime Workspace
          </p>
          <h2 className="ink-title mb-6 mt-2 text-[1.8rem] sm:text-[2.1rem]">
            {type === "signin"
              ? "Welcome back to your studio"
              : "Open your collaborative studio"}
          </h2>
          <p className="-mt-3 mb-5 text-[0.86rem] soft-copy">
            {type === "signin"
              ? "Continue where you left off."
              : "Create your account and start collaborating."}
          </p>

          <form onSubmit={handleSubmit} className="grid gap-3">
            <input
              className="input"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
            <div className="relative">
              <input
                className="input pr-20"
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={
                  type === "signup" ? "new-password" : "current-password"
                }
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-[rgba(26,26,26,.15)] bg-[rgba(255,250,241,.85)] px-2 py-1 text-[0.72rem] font-semibold text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>

            {type === "signup" && (
              <p className="-mt-1 text-[0.74rem] soft-copy">
                Strong password required.
              </p>
            )}

            {error && (
              <div className="rounded-[10px] border border-[rgba(172,56,48,.35)] bg-[rgba(172,56,48,.12)] px-3 py-2 text-[0.83rem] text-[#8c2317]">
                {error}
              </div>
            )}

            <button
              className="btn btn-primary btn-lg mt-1 flex w-full items-center justify-center gap-2"
              disabled={loading}
            >
              {loading && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
              )}
              {loading
                ? "Processing…"
                : type === "signin"
                  ? "Sign In"
                  : "Create Account"}
            </button>
          </form>

          <p className="mt-4 text-[0.88rem] soft-copy">
            {type === "signin"
              ? "Don't have an account? "
              : "Already have an account? "}
            <Link
              href={type === "signin" ? "/auth/signup" : "/auth/signin"}
              className="font-semibold text-[var(--brand)] hover:underline"
            >
              {type === "signin" ? "Sign up" : "Sign in"}
            </Link>
          </p>
        </div>
      </div>

      <div
        className="relative hidden overflow-hidden lg:flex lg:flex-1"
        style={{
          background:
            "linear-gradient(130deg, rgba(253,248,238,.96), rgba(242,231,210,.86)), radial-gradient(circle at 14% 18%, rgba(13,91,215,.32), transparent 34%), radial-gradient(circle at 85% 74%, rgba(227,106,31,.28), transparent 41%), radial-gradient(circle at 60% 22%, rgba(20,26,38,.08), transparent 36%)",
        }}
      >
        <Image
          src="/auth-hero.webp"
          alt="Creative collaboration scene"
          fill
          priority
          className="z-0 object-cover opacity-[0.5] mix-blend-multiply"
          sizes="50vw"
        />

        <div className="absolute inset-0 z-[1] bg-[linear-gradient(to_top,rgba(255,250,241,.8),rgba(255,250,241,.06)_42%,rgba(255,250,241,.2))]" />

        <div className="absolute left-9 top-10 z-20 max-w-[480px]">
          <span className="ink-stamp">Realtime Collaboration</span>
          <h3 className="mt-3 text-[2.35rem] font-semibold leading-[1.02] tracking-[-0.03em] text-[var(--ink)]">
            Design rooms that feel
            <span className="line-scribble ml-2 inline-block">alive</span>
          </h3>
          <p className="mt-3 max-w-[420px] text-[0.96rem] leading-[1.55] soft-copy">
            Pencil.io blends canvas, chat, and media into one cinematic
            workspace where ideas stay in motion.
          </p>
        </div>

        <div
          className="absolute left-9 top-[290px] z-20 max-w-[330px] rounded-2xl border border-[rgba(26,26,26,.14)] bg-[rgba(255,250,241,.72)] p-5 text-[0.95rem] soft-copy shadow-[0_12px_30px_rgba(43,35,27,.12)]"
          style={{
            backdropFilter: "blur(6px)",
            animation: "floatOrb 12s ease-in-out infinite",
          }}
        >
          "From first sketch to final decision, every collaborator stays in the
          same rhythm."
        </div>

        <div
          className="absolute -left-[130px] -top-[120px] z-10 h-[500px] w-[500px] rounded-full border border-[rgba(26,26,26,.08)]"
          style={{ animation: "floatOrb 16s ease-in-out infinite" }}
        />
        <div
          className="absolute bottom-[95px] right-[55px] z-10 h-[260px] w-[260px] rounded-full border border-[rgba(26,26,26,.1)]"
          style={{ animation: "floatOrb 12s ease-in-out infinite .4s" }}
        />
        <div
          className="absolute right-[18%] top-[24%] z-10 h-[180px] w-[180px] rounded-full border border-[rgba(13,91,215,.18)]"
          style={{ animation: "floatOrb 10s ease-in-out infinite .2s" }}
        />
        <div
          className="absolute -bottom-20 left-[42%] z-10 h-[220px] w-[220px] rounded-full bg-[rgba(13,91,215,.13)] blur-3xl"
          style={{ animation: "floatOrb 10s ease-in-out infinite .8s" }}
        />

        <div className="absolute inset-x-0 bottom-0 z-20 border-t border-[rgba(26,26,26,.1)] bg-[rgba(255,250,241,.72)] px-9 py-5">
          <div className="flex items-center justify-between gap-6">
            <div>
              <p className="text-[0.72rem] uppercase tracking-[0.11em] text-[var(--ink-soft)]">
                Experience
              </p>
              <p className="mt-1 text-[1.05rem] font-semibold text-[var(--ink)]">
                Crafted for high-end product experiences
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="rounded-xl border border-[rgba(26,26,26,.15)] bg-[rgba(255,250,241,.86)] px-3 py-2">
                <p className="text-[1rem] font-semibold text-[var(--ink)]">
                  12ms
                </p>
                <p className="text-[0.66rem] uppercase tracking-[0.08em] text-[var(--ink-soft)]">
                  Sync
                </p>
              </div>
              <div className="rounded-xl border border-[rgba(26,26,26,.15)] bg-[rgba(255,250,241,.86)] px-3 py-2">
                <p className="text-[1rem] font-semibold text-[var(--ink)]">
                  3-in-1
                </p>
                <p className="text-[0.66rem] uppercase tracking-[0.08em] text-[var(--ink-soft)]">
                  Workspace
                </p>
              </div>
              <div className="rounded-xl border border-[rgba(26,26,26,.15)] bg-[rgba(255,250,241,.86)] px-3 py-2">
                <p className="text-[1rem] font-semibold text-[var(--ink)]">
                  Live
                </p>
                <p className="text-[0.66rem] uppercase tracking-[0.08em] text-[var(--ink-soft)]">
                  Presence
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

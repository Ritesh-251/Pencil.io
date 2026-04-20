 'use client';
import Link from 'next/link';
import { useState } from 'react';

export const HeroSection = () => {
  const [roomCode, setRoomCode] = useState('');

  const joinRoom = () => {
    const normalized = roomCode.trim();
    if (!normalized) return;
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    window.location.href = token ? `/room/${normalized}` : `/auth/signin?join=${encodeURIComponent(normalized)}`;
  };

  return (
    <section className="app-shell ambient-noise relative grid min-h-[calc(100vh-90px)] place-items-center px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0 opacity-70"
          style={{
            background:
              'radial-gradient(circle at 16% 36%, rgba(13,91,215,.23) 0 2px, transparent 3px), radial-gradient(circle at 64% 18%, rgba(227,106,31,.24) 0 2px, transparent 3px), radial-gradient(circle at 84% 58%, rgba(47,99,64,.2) 0 2px, transparent 3px)',
            backgroundSize: '170px 170px',
          }}
        />
        <div
          className="absolute left-[6%] top-[10%] h-[260px] w-[260px] rounded-full"
          style={{
            background: 'radial-gradient(circle at 35% 35%, rgba(13,91,215,.5), rgba(13,91,215,.06))',
            animation: 'floatOrb 8s ease-in-out infinite',
          }}
        />
        <div
          className="absolute right-[10%] top-[58%] h-[190px] w-[190px] rounded-full"
          style={{
            background: 'radial-gradient(circle at 35% 35%, rgba(227,106,31,.46), rgba(227,106,31,.08))',
            animation: 'floatOrb 8s ease-in-out infinite 2s',
          }}
        />
      </div>

      <div className="relative z-[1] mx-auto grid w-full max-w-[1180px] items-start gap-6 lg:items-end lg:grid-cols-[1.2fr_.8fr]">
        <div className="animate-fade-in-up">
          <p className="ink-stamp mb-3">Realtime creative ops</p>
          <h1 className="ink-title m-0 max-w-[780px] text-[clamp(2.4rem,8vw,6.4rem)]">
            Work that feels like
            <br />
            <span className="line-scribble bg-[linear-gradient(95deg,#1a1a1a,#0d5bd7_52%,#e36a1f_95%)] bg-clip-text text-transparent">a live studio.</span>
          </h1>

          <p className="soft-copy mt-5 max-w-[620px] text-[1.04rem] leading-[1.75] animate-fade-in-up stagger-1">
            Pencil.io brings sketching, decision logs, and team chat into one tactile room.
            It stays fast under load and clear under pressure.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3 animate-fade-in-up stagger-2">
            <Link href="/auth/signup" className="btn btn-primary btn-lg">Launch a room</Link>
            <a href="#features" className="btn btn-outline btn-lg">See flow</a>
          </div>

          <div className="glass paper-slice mt-5 grid w-full max-w-[590px] gap-1.5 rounded-[16px] p-1.5 animate-fade-in-up stagger-3 grid-cols-1 sm:grid-cols-[1fr_auto]">
            <input
              className="rounded-[12px] border-0 bg-[rgba(255,250,241,.75)] px-3.5 py-2.5 text-[0.92rem] text-[var(--ink)] outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-[rgba(13,91,215,.52)]"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
              placeholder="Paste room id to join instantly"
              aria-label="Room code"
            />
            <button type="button" onClick={joinRoom} className="btn btn-outline w-full sm:w-auto sm:min-w-[100px]">Join room</button>
          </div>

          <p className="soft-copy mt-3.5 text-[0.82rem]">Used by product squads, growth teams, and design studios shipping weekly.</p>
        </div>

        <div id="why" className="glass animate-fade-in-up rounded-[20px] border-[rgba(26,26,26,.17)] p-5 [animation-delay:110ms]">
          <p className="mb-2 text-[0.74rem] font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">Why teams stay</p>
          <ul className="m-0 grid list-none gap-2 p-0 text-[0.95rem]">
            <li className="rounded-xl border border-[rgba(26,26,26,.14)] bg-[rgba(255,250,241,.65)] px-3 py-2">Canvas + chat in one room id</li>
            <li className="rounded-xl border border-[rgba(26,26,26,.14)] bg-[rgba(255,250,241,.65)] px-3 py-2">Live connection status and graceful reconnect</li>
            <li className="rounded-xl border border-[rgba(26,26,26,.14)] bg-[rgba(255,250,241,.65)] px-3 py-2">Fast collaboration patterns without tool bloat</li>
          </ul>
          <div className="mt-4 rounded-xl border border-dashed border-[rgba(26,26,26,.22)] p-3 text-[0.85rem] soft-copy">
            Human-centered by design: less chrome, more clarity, better momentum.
          </div>
        </div>
      </div>
    </section>
  );
};

export const FeaturesRow = () => (
  <section id="features" className="px-4 pb-24 pt-4 sm:px-6">
    <div className="mx-auto grid w-full max-w-[1200px] gap-3 md:grid-cols-3">
      <div className="glass rounded-2xl p-5">
        <h3 className="mb-2 text-[1.02rem]">Infinite Canvas</h3>
        <p className="m-0 text-sm leading-6 soft-copy">Grid-aware drawing with lightweight tools, smooth pan and object-level updates.</p>
      </div>
      <div className="glass rounded-2xl p-5">
        <h3 className="mb-2 text-[1.02rem]">Live Collaboration</h3>
        <p className="m-0 text-sm leading-6 soft-copy">Presence, grouped chat, and instant visual acknowledgement on shared edits.</p>
      </div>
      <div className="glass rounded-2xl p-5">
        <h3 className="mb-2 text-[1.02rem]">Built For Scale</h3>
        <p className="m-0 text-sm leading-6 soft-copy">Sync states, reconnect awareness, and busy indicators designed for real traffic.</p>
      </div>
    </div>
  </section>
);

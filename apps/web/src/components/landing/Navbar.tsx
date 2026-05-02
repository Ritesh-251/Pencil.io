import Link from "next/link";

export const Navbar = () => (
  <nav className="glass sticky top-4 z-20 mx-auto mt-4 flex w-[min(1200px,calc(100%-2rem))] items-center justify-between rounded-2xl px-4 py-3 md:px-5">
    <div className="flex items-center gap-2.5 font-bold">
      <div className="grid h-9 w-9 place-items-center rounded-[10px] border border-[rgba(26,26,26,0.2)] bg-[rgba(13,91,215,0.12)]">
        ✏️
      </div>
      <div className="text-[1.02rem] tracking-[-0.02em]">MyPencil</div>
    </div>
    <div className="hidden items-center gap-4 md:flex">
      <a
        href="#features"
        className="text-[0.86rem] text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]"
      >
        Features
      </a>
      <a
        href="#why"
        className="text-[0.86rem] text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]"
      >
        Why teams switch
      </a>
    </div>
    <div className="flex gap-2">
      <Link href="/auth/signin" className="btn btn-ghost hidden sm:inline-flex">
        Sign In
      </Link>
      <Link
        href="/auth/signup"
        aria-label="Start collaborating now"
        className="btn btn-primary"
      >
        Start now
      </Link>
    </div>
  </nav>
);

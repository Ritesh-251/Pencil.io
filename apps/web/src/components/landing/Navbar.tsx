import Link from "next/link";

export const Navbar = () => (
  <nav className="glass sticky top-4 z-20 mx-auto mt-4 flex w-[min(1200px,calc(100%-2rem))] items-center justify-between rounded-2xl px-4 py-3 md:px-5">
    <Link href="/" className="flex items-center transition-opacity hover:opacity-90">
      <img
        src="/logo-wordmark-light.svg"
        alt="MyPencil Logo"
        className="h-8 w-auto object-contain"
      />
    </Link>
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

import { Link, useRoute } from "wouter";

function NavLink({ href, label }: { href: string; label: string }) {
  const [active] = useRoute(`${href}/:rest*`);
  const [exact] = useRoute(href);
  const isSelected = active || exact;

  return (
    <Link
      href={href}
      className={`relative px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${
        isSelected
          ? "text-brand-primary dark:text-white bg-brand-primary/10 dark:bg-neutral-800/80 shadow-[0_2px_10px_-3px_rgba(99,102,241,0.2)]"
          : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-900/60"
      }`}
    >
      {label}
      {isSelected && (
        <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-brand-primary dark:bg-indigo-400 animate-pulse" />
      )}
    </Link>
  );
}

export function Nav() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-neutral-200/80 bg-white/80 backdrop-blur-md dark:border-neutral-900/80 dark:bg-neutral-950/80 transition-colors duration-300">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link href="/tests" className="flex items-center gap-2.5 group">
            {/* Beautiful futuristic double-circle emblem logo */}
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-primary to-indigo-400 p-0.5 shadow-lg shadow-brand-primary/20 transition-transform duration-300 group-hover:scale-105">
              <div className="h-full w-full rounded-[10px] bg-neutral-950 flex items-center justify-center">
                <span className="text-white text-base font-extrabold tracking-tighter">
                  G
                </span>
              </div>
              <div className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-neutral-950 bg-brand-success shadow-sm" />
            </div>
            <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-neutral-900 to-neutral-700 bg-clip-text text-transparent dark:from-white dark:to-neutral-300">
              Gimbal
            </span>
          </Link>
          <nav className="flex items-center gap-1.5">
            <NavLink href="/tests" label="Tests" />
            <NavLink href="/reviews" label="Review Queue" />
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {/* Liveness Indicator */}
          <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3.5 py-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
            <span className="font-mono">Port: 4319</span>
          </div>
        </div>
      </div>
    </header>
  );
}

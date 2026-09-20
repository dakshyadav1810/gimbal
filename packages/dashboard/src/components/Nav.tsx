import { Link, useRoute } from "wouter";
import gimbalIcon from "../assets/gimbal-icon.png";

function NavLink({ href, label }: { href: string; label: string }) {
  const [active] = useRoute(`${href}/:rest*`);
  const [exact] = useRoute(href);
  const isSelected = active || exact;

  return (
    <Link
      href={href}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        isSelected
          ? "bg-brand-primary/10 text-brand-primary"
          : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
      }`}
    >
      {label}
    </Link>
  );
}

export function Nav() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-[var(--border-default)] bg-[var(--surface-panel)]">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <Link href="/tests" className="flex items-center gap-2">
            <img src={gimbalIcon} alt="" className="h-6 w-6" />
            <span className="text-base font-bold tracking-tight text-[var(--text-primary)]">
              Gimbal
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            <NavLink href="/tests" label="Tests" />
            <NavLink href="/reviews" label="Review Queue" />
          </nav>
        </div>
      </div>
    </header>
  );
}

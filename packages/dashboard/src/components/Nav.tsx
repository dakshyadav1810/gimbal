import { Link, useRoute } from "wouter";

function NavLink({ href, label }: { href: string; label: string }) {
  const [active] = useRoute(`${href}/:rest*`);
  const [exact] = useRoute(href);
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded text-sm font-medium ${
        active || exact
          ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
          : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
      }`}
    >
      {label}
    </Link>
  );
}

export function Nav() {
  return (
    <nav className="flex items-center gap-2 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
      <span className="mr-4 font-semibold text-neutral-900 dark:text-neutral-100">
        Gimbal
      </span>
      <NavLink href="/tests" label="Tests" />
      <NavLink href="/reviews" label="Reviews" />
    </nav>
  );
}

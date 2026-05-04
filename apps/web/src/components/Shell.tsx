import { Link, useLocation } from "@tanstack/react-router";
import { Cloud, GithubLogo } from "@phosphor-icons/react";

const links = [
  { to: "/", label: "Home" },
  { to: "/demo", label: "Demo" },
  { to: "/docs", label: "Docs" },
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-kumo-base text-kumo-default">
      <header className="sticky top-0 z-20 border-b border-kumo-line bg-kumo-base/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 text-sm font-semibold text-kumo-default">
            <span className="grid size-7 place-items-center rounded-md border border-kumo-line bg-kumo-elevated">
              <Cloud size={17} weight="duotone" />
            </span>
            Cloudbox
          </Link>
          <nav className="flex items-center gap-1" aria-label="Main navigation">
            {links.map((link) => {
              const active = location.pathname === link.to;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`rounded-md px-3 py-1.5 text-sm ${
                    active ? "bg-kumo-elevated text-kumo-default" : "text-kumo-strong hover:bg-kumo-elevated"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            <a
              href="https://github.com/acoyfellow/cloudbox"
              className="ml-1 grid size-8 place-items-center rounded-md text-kumo-strong hover:bg-kumo-elevated"
              aria-label="GitHub"
            >
              <GithubLogo size={18} />
            </a>
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

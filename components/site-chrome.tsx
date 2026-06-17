"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { directory } from "@/directory.config";

type ChromeUser = { id: string } | null;

// Routes that render their own full-screen UI and must NOT be wrapped in the
// site Header/Footer. /r1a_client runs inside the R1 WebView at 240×282px —
// site chrome would crowd the device screen and is meaningless there.
const CHROME_FREE_PREFIXES = ["/r1a_client"];

export function SiteChrome({
  user,
  children,
}: {
  user: ChromeUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const bare = CHROME_FREE_PREFIXES.some(
    (p) => pathname === p || pathname?.startsWith(`${p}/`),
  );

  if (bare) return <>{children}</>;

  return (
    <>
      <Header user={user} />
      {children}
      <Footer />
    </>
  );
}

function Header({ user }: { user: ChromeUser }) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold text-sm hover:opacity-80 transition-opacity"
        >
          <span className="text-base font-bold">{directory.name}</span>
        </Link>

        <nav className="flex items-center gap-2">
          <Link
            href="https://buymeacoffee.com/boondit"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:block text-sm font-medium text-amber-600 dark:text-amber-500 hover:opacity-80 transition-opacity px-3 py-1.5 rounded-md hover:bg-card"
          >
            Donate
          </Link>
          {user ? (
            <>
              <Link
                href="/dashboard"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-md hover:bg-card"
              >
                Dashboard
              </Link>
              <Link
                href="/dashboard/settings"
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:brightness-110 transition-all"
              >
                Settings
              </Link>
            </>
          ) : (
            <Link
              href="/auth/signin"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:brightness-110 transition-all"
            >
              Sign In
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
      <div className="mx-auto max-w-6xl px-4 flex items-center justify-between">
        <p>
          © {new Date().getFullYear()} {directory.name}. All rights reserved.
        </p>
        <p className="hidden sm:block">
          This is a fan website and is not affiliated with Rabbit Inc.
        </p>
        <div className="flex gap-3">
          <Link href="/tos" className="hover:text-foreground transition-colors">
            Terms
          </Link>
          <span>•</span>
          <Link
            href="/privacy"
            className="hover:text-foreground transition-colors"
          >
            Privacy
          </Link>
        </div>
      </div>
    </footer>
  );
}

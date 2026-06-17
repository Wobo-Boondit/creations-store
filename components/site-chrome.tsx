"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { directory } from "@/directory.config";
import { UserMenu } from "@/components/user-menu";

type ChromeUser = {
  id: string;
  username: string;
  avatarUrl: string | null;
} | null;

// Brand stripe — three-section gradient shared with rhythm's header/footer.
function BrandStripe() {
  return (
    <div className="flex h-[3px] w-full">
      <div className="flex-1" style={{ background: "#FF1F8F" }} />
      <div className="flex-1" style={{ background: "#A864FF" }} />
      <div className="flex-1" style={{ background: "#1F4A3F" }} />
    </div>
  );
}

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
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md">
      <BrandStripe />
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm font-semibold transition-opacity hover:opacity-80"
        >
          <span className="text-base font-bold">{directory.name}</span>
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          <Link
            href="https://buymeacoffee.com/boondit"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden rounded-md px-3 py-2 text-sm font-medium text-amber-500 transition-opacity hover:bg-card hover:opacity-80 sm:block"
          >
            Donate
          </Link>
          {user ? (
            <UserMenu username={user.username} avatarUrl={user.avatarUrl} />
          ) : (
            <Link
              href="/auth/signin"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-all hover:brightness-110"
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
    <footer className="text-center text-xs text-muted-foreground">
      {/* Brand stripe bookend — mirrors the header stripe */}
      <BrandStripe />
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6">
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

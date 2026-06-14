import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import Image from "next/image";
import Link from "next/link";
import Logo from "@/public/logo.svg";
import "./globals.css";
import { Manrope as Font } from "next/font/google";
import { getCurrentUser } from "@/lib/auth";

import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";

import { signOut } from "@/lib/actions";
import { directory } from "@/directory.config";

const font = Font({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: directory.title,
  description: directory.description,
  metadataBase: new URL(directory.baseUrl),
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  return (
    <html lang="en">
      <body className={`${font.className} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Header user={user} />
          {children}
          <Footer />
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}

const Header = async ({ user }: { user: any }) => {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-sm">
      <div className="flex h-12 items-center justify-between px-4 md:px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-semibold text-sm hover:opacity-80 transition-opacity">
          <span className="text-base font-bold">{directory.name}</span>
        </Link>

        {/* User Menu */}
        <nav className="flex items-center gap-2">
          <Link
            href="https://buymeacoffee.com/boondit"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:block text-sm font-medium text-amber-600 hover:text-amber-700 dark:text-amber-500 dark:hover:text-amber-400 transition-colors px-3 py-1.5 rounded-md hover:bg-accent"
          >
            ☕ Donate
          </Link>
          {user ? (
            <>
              <Link
                href="/dashboard"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-md hover:bg-accent"
              >
                Dashboard
              </Link>
              <form action={signOut} className="inline">
                <button
                  type="submit"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-md hover:bg-accent"
                >
                  Sign Out
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/auth/signin"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-md hover:bg-accent"
            >
              <span className="sm:hidden">Sign In</span>
              <span className="hidden sm:inline">Sign In with Discord</span>
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
};

const Footer = () => {
  return (
    <footer className="border-t bg-muted/40">
      <div className="flex items-center justify-between gap-3 px-6 py-4">
        <div className="grid gap-1 text-xs text-muted-foreground">
          <p>
            © {new Date().getFullYear()} {directory.name}. All rights reserved.
          </p>
          <p>
            This is a fan website and is not affiliated with, endorsed by, or associated with Rabbit Inc.
          </p>
          <div className="flex gap-3">
            <Link href="/tos" className="hover:text-foreground transition-colors">
              Terms of Service
            </Link>
            <span>•</span>
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
          </div>
        </div>
        <ThemeToggle />
      </div>
    </footer>
  );
};

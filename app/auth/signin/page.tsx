import Link from "next/link";

// Only allow same-site relative paths as the post-login destination, so the
// `redirect` param can't be abused as an open redirect to another origin.
function safeRedirect(value?: string): string | null {
  if (!value) return null;
  // Must be a root-relative path, not a protocol-relative ("//evil") or absolute URL.
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect } = await searchParams;
  const dest = safeRedirect(redirect);
  const discordHref = dest
    ? `/auth/discord?redirect=${encodeURIComponent(dest)}`
    : "/auth/discord";

  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6">
        <h1 className="mb-2 text-center text-2xl font-bold">Sign in</h1>
        <p className="text-center text-sm text-muted-foreground">
          Continue to your Boondit account
        </p>

        {/* Server-side PKCE flow — keep this an <a> to /auth/discord (the route
            handler captures the code verifier); do NOT swap to a client
            signInWithOAuth call. */}
        <a
          href={discordHref}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-[#5865F2] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          <svg
            width="16"
            height="12"
            viewBox="0 0 71 55"
            fill="currentColor"
            aria-hidden
          >
            <path d="M60.1 4.9A58.5 58.5 0 0 0 45.5.36a.22.22 0 0 0-.23.11c-.62 1.1-1.32 2.54-1.8 3.66a54 54 0 0 0-16.23 0c-.5-1.15-1.2-2.56-1.84-3.66a.23.23 0 0 0-.23-.11A58.3 58.3 0 0 0 10.5 4.9a.2.2 0 0 0-.1.08C1.2 18.73-1.3 32.14-.08 45.39a.24.24 0 0 0 .1.17 58.8 58.8 0 0 0 17.7 8.95.23.23 0 0 0 .25-.08c1.36-1.86 2.58-3.82 3.62-5.88a.22.22 0 0 0-.12-.31 38.7 38.7 0 0 1-5.53-2.64.23.23 0 0 1-.02-.38c.37-.28.74-.57 1.1-.86a.22.22 0 0 1 .23-.03c11.6 5.3 24.16 5.3 35.62 0a.22.22 0 0 1 .23.03c.36.3.73.58 1.1.86a.23.23 0 0 1-.02.38 36.3 36.3 0 0 1-5.53 2.64.22.22 0 0 0-.12.31 47 47 0 0 0 3.62 5.88.23.23 0 0 0 .25.08 58.6 58.6 0 0 0 17.72-8.95.23.23 0 0 0 .1-.17c1.45-15.32-2.43-28.62-10.3-40.41a.18.18 0 0 0-.1-.09zM23.7 37.33c-3.5 0-6.37-3.21-6.37-7.15 0-3.95 2.82-7.16 6.37-7.16 3.58 0 6.43 3.24 6.37 7.16 0 3.94-2.82 7.15-6.37 7.15zm23.6 0c-3.5 0-6.37-3.21-6.37-7.15 0-3.95 2.81-7.16 6.37-7.16 3.57 0 6.43 3.24 6.37 7.16 0 3.94-2.8 7.15-6.37 7.15z" />
          </svg>
          Continue with Discord
        </a>

        <div className="text-center">
          <Link
            href="/"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}

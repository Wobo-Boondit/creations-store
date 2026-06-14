# creations.boondit.site

A curated directory for Rabbit R1 creations, apps, and tools. Built with Next.js 15, Supabase, and S3.

## Tech Stack

- **Framework**: Next.js 15 (App Router, Server Actions)
- **Database**: Supabase (PostgreSQL + RLS)
- **Auth**: Supabase Auth (Discord OAuth) + BOHO password admin
- **Storage**: Linode Object Storage (S3-compatible) via cdn.boondit.site
- **Styling**: Tailwind CSS + shadcn/ui, PowerGrotesk font
- **Runtime**: Node.js 20, PM2

## Features

- Curated creation directory with search, categories, and reviews
- S3-backed icon and screenshot hosting (CDN-only)
- Shared authentication with rhythm.boondit.site (.boondit.site cookie domain)
- Admin dashboard with BOHO password auth + rate limiting
- Analytics: views, clicks, installs with IP anonymization
- CSP, HSTS, and full security headers
- Discord OAuth with admin role via server-managed identity data

## Setup

```bash
pnpm install
cp .env.example .env.local
# Fill in your Supabase + S3 credentials
pnpm dev
```

## License

MIT

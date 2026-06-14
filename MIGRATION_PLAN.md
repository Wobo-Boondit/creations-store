# Unified Boondit Auth — Migration & Merge Plan

## Goal

One identity across all Boondit services. creations-store migrates from
Turso/SQLite + NextAuth to rhythm's Supabase/Postgres + Supabase Auth.
Every user account and creation survives the move. Duplicate accounts
(same person on both services) get merged.

---

## What Exists Today

### rhythm (Supabase — the identity provider)
- `auth.users` — Supabase managed, email/password + Discord OAuth
- `public.users` — profile table: `id (uuid → auth.users)`, `username`, `avatar_url`, `r1_device_id`
- `public.songs`, `public.scores`, `public.r1_link_tokens`
- All tables have RLS enabled
- Auth: `@supabase/ssr` cookie sessions
- Admin client: service role key bypasses RLS

### creations-store (Turso/SQLite — being migrated)
- NextAuth v4, Discord OAuth only, JWT sessions
- `users` — random UUID, email, name, username (discord handle), avatar, isAdmin, isSuspended
- `sessions` — NextAuth session store (not migrating)
- `categories` — id (text slug), name, description, slug, color, icon
- `creations` — autoincrement int PK, url, title, slug, description, categoryId, userId, status, metadata (iconUrl, themeColor, author, screenshotUrl), legacy fields (favicon, screenshot, overview), SEO fields, analytics (views), moderation (isFlagged), proxyCode
- `creationScreenshots` — creationId, url, isMain
- `creationViews` — creationId, sessionId, viewedAt (view spam prevention)
- `creationReviews` — creationId, userId, rating (1-5), comment
- `creationClicks` — creationId, sessionId, userAgent, referrer
- `creationInstalls` — creationId, sessionId, userAgent
- `creationDailyStats` — creationId, date, clicks, uniqueClicks, installs, activeUsers

### r1a / R-PlusPlus
- Clean at HEAD. Not touched in this phase. Will integrate later.

---

## Phase 1: Postgres Schema (new tables in rhythm's Supabase)

### New tables to create

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Categories (ported from SQLite, same structure)
CREATE TABLE public.store_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  slug TEXT NOT NULL UNIQUE,
  color TEXT,
  icon TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

-- Creations (ported, userId → auth.users UUID)
CREATE TABLE public.store_creations (
  id SERIAL PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  category_id TEXT REFERENCES public.store_categories(id),
  tags TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  icon_url TEXT,
  theme_color TEXT,
  author TEXT,
  screenshot_url TEXT,
  favicon TEXT,
  screenshot TEXT,
  overview TEXT,
  og_image TEXT,
  og_title TEXT,
  og_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_visited TIMESTAMPTZ,
  notes TEXT,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  search_results TEXT,
  views INTEGER NOT NULL DEFAULT 0,
  proxy_code TEXT UNIQUE,
  is_flagged BOOLEAN NOT NULL DEFAULT false,
  flag_reason TEXT
);

CREATE INDEX store_creations_user_idx ON public.store_creations(user_id);
CREATE INDEX store_creations_status_idx ON public.store_creations(status);
CREATE INDEX store_creations_views_idx ON public.store_creations(views);
CREATE INDEX store_creations_proxy_code_idx ON public.store_creations(proxy_code);

-- Screenshots
CREATE TABLE public.store_screenshots (
  id SERIAL PRIMARY KEY,
  creation_id INTEGER NOT NULL REFERENCES public.store_creations(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  is_main BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX store_screenshots_creation_idx ON public.store_screenshots(creation_id);

-- Reviews
CREATE TABLE public.store_reviews (
  id SERIAL PRIMARY KEY,
  creation_id INTEGER NOT NULL REFERENCES public.store_creations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX store_reviews_creation_idx ON public.store_reviews(creation_id);
CREATE INDEX store_reviews_user_idx ON public.store_reviews(user_id);
CREATE UNIQUE INDEX store_reviews_creation_user_idx ON public.store_reviews(creation_id, user_id);

-- Clicks
CREATE TABLE public.store_clicks (
  id SERIAL PRIMARY KEY,
  creation_id INTEGER NOT NULL REFERENCES public.store_creations(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  user_agent TEXT,
  referrer TEXT,
  clicked_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX store_clicks_creation_idx ON public.store_clicks(creation_id);
CREATE INDEX store_clicks_session_idx ON public.store_clicks(session_id);
CREATE INDEX store_clicks_clicked_at_idx ON public.store_clicks(clicked_at);

-- Installs
CREATE TABLE public.store_installs (
  id SERIAL PRIMARY KEY,
  creation_id INTEGER NOT NULL REFERENCES public.store_creations(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  user_agent TEXT,
  installed_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX store_installs_creation_idx ON public.store_installs(creation_id);
CREATE INDEX store_installs_session_idx ON public.store_installs(session_id);

-- Daily Stats
CREATE TABLE public.store_daily_stats (
  id SERIAL PRIMARY KEY,
  creation_id INTEGER NOT NULL REFERENCES public.store_creations(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  unique_clicks INTEGER NOT NULL DEFAULT 0,
  installs INTEGER NOT NULL DEFAULT 0,
  active_users INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX store_daily_stats_creation_idx ON public.store_daily_stats(creation_id);
CREATE INDEX store_daily_stats_date_idx ON public.store_daily_stats(date);
CREATE UNIQUE INDEX store_daily_stats_creation_date_idx ON public.store_daily_stats(creation_id, date);

-- View tracking (spam prevention)
CREATE TABLE public.store_views (
  id SERIAL PRIMARY KEY,
  creation_id INTEGER NOT NULL REFERENCES public.store_creations(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  viewed_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX store_views_creation_session_idx ON public.store_views(creation_id, session_id);
```

### RLS Policies

```sql
ALTER TABLE public.store_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_creations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_screenshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_installs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_views ENABLE ROW LEVEL SECURITY;

-- Categories: public read
CREATE POLICY store_categories_read ON public.store_categories FOR SELECT USING (true);

-- Creations: public reads published, owner can CRUD
CREATE POLICY store_creations_read ON public.store_creations FOR SELECT USING (true);
CREATE POLICY store_creations_insert ON public.store_creations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY store_creations_update ON public.store_creations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY store_creations_delete ON public.store_creations FOR DELETE USING (auth.uid() = user_id);

-- Screenshots: public read, creation owner writes
CREATE POLICY store_screenshots_read ON public.store_screenshots FOR SELECT USING (true);
CREATE POLICY store_screenshots_insert ON public.store_screenshots FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.store_creations WHERE id = creation_id AND user_id = auth.uid()));
CREATE POLICY store_screenshots_delete ON public.store_screenshots FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.store_creations WHERE id = creation_id AND user_id = auth.uid()));

-- Reviews: public read, auth user inserts own
CREATE POLICY store_reviews_read ON public.store_reviews FOR SELECT USING (true);
CREATE POLICY store_reviews_insert ON public.store_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY store_reviews_update ON public.store_reviews FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY store_reviews_delete ON public.store_reviews FOR DELETE USING (auth.uid() = user_id);

-- Clicks/Installs/Views/Stats: public insert (anonymous tracking), service role reads
CREATE POLICY store_clicks_insert ON public.store_clicks FOR INSERT WITH CHECK (true);
CREATE POLICY store_installs_insert ON public.store_installs FOR INSERT WITH CHECK (true);
CREATE POLICY store_views_insert ON public.store_views FOR INSERT WITH CHECK (true);
CREATE POLICY store_daily_stats_insert ON public.store_daily_stats FOR INSERT WITH CHECK (true);
CREATE POLICY store_daily_stats_read ON public.store_daily_stats FOR SELECT USING (true);
```

### What changed from SQLite
| SQLite | Postgres | Why |
|--------|----------|-----|
| `users` table | removed | using `auth.users` + `public.users` |
| `sessions` table | removed | Supabase manages sessions |
| `user_id TEXT` (random UUID) | `user_id UUID → auth.users(id)` | real FK to shared identity |
| `INTEGER timestamp (unixepoch)` | `TIMESTAMPTZ DEFAULT now()` | proper Postgres timestamps |
| `INTEGER PK autoincrement` | `SERIAL` | same behavior in Postgres |
| `is_admin INTEGER boolean` | check against Discord ID in app code | admin logic moves to app layer |
| `is_suspended INTEGER boolean` | add `is_suspended BOOLEAN` to `public.users` | merged into shared profile |

Add to `public.users`:
```sql
ALTER TABLE public.users ADD COLUMN is_suspended BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN bio TEXT;
```

---

## Phase 2: User Account Migration & Merge

### Strategy
Match creations-store users to rhythm auth.users by **email** (case-insensitive).

```
For each creations-store user:
  1. Query Supabase: SELECT id FROM auth.users WHERE lower(email) = lower(user_email)
  2. If found → that's the same person. Map old_id → supabase_id.
  3. If not found → create new auth.users entry via admin API.
     - email: user_email
     - email_confirm: true (skip confirmation)
     - user_metadata: { username, name, avatar, source: "creations-store" }
     - Map old_id → new supabase_id.
  4. Update public.users profile with avatar_url, bio if missing.
```

### Admin flag migration
The creations-store `isAdmin` field maps to a check in app code:
```typescript
const ADMIN_DISCORD_IDS = ["592732401856282638"]; // Aidan
// Check via auth.users raw_user_meta_data → provider_id
```
No DB column needed — admin is app-level config.

### What could go wrong
- **Email mismatch** — same person used different email on each service.
  - Mitigation: dump both email lists, compare manually before running migration.
  - After migration, anyone who can't access their creations can contact admin to merge manually.
- **Discord OAuth users without email** — all creations-store users have email (NextAuth requires it). Low risk.
- **Duplicate emails in creations-store** — Turso has `email UNIQUE` constraint. Not possible.

### Migration script (Node.js)
```
scripts/migrate-to-supabase.ts

Input:  Turso connection (read-only)
Output: Supabase project (write via service role)
Side:   Writes ID mapping file (old_uuid → supabase_uuid)

Steps:
  1. Read all users from Turso
  2. For each: check/insert into auth.users, build ID map
  3. Read all categories, insert into store_categories
  4. Read all creations, transform user_id via map, insert into store_creations
  5. Read all screenshots/reviews/clicks/installs/views/stats, insert
  6. Verify: count rows in each table, compare Turso vs Supabase
  7. Output migration report
```

---

## Phase 3: creations-store Auth Swap

### Remove
- `next-auth` package
- `lib/auth.ts` (NextAuth config)
- `app/api/auth/[...nextauth]/route.ts`
- `types/next-auth.d.ts`
- `sessions` table references
- Drizzle SQLite adapter (`@libsql/client`, `drizzle-orm/libsql`)

### Add
- `@supabase/supabase-js`
- `@supabase/ssr`
- `lib/supabase/client.ts` — browser client (same as rhythm)
- `lib/supabase/server.ts` — server client (same as rhythm)
- `lib/supabase/admin.ts` — admin client (same as rhythm)
- `db/client.ts` — rewrite to use Supabase Postgres instead of Turso

### Changes per file

**`db/client.ts`**
- Remove libsql + drizzle
- Export Supabase client for direct queries (or use @supabase/ssr pattern)

**`db/schema.ts`**
- Remove Drizzle schema definitions
- Replace with TypeScript types matching the new Postgres tables
- Or switch to Prisma if preferred (Drizzle also works with Postgres)

**`lib/auth.ts`**
- Delete NextAuth config
- Replace with Supabase session helpers:
  ```typescript
  export async function getSession() {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  }
  export async function isAdmin(): Promise<boolean> {
    const user = await getSession();
    if (!user) return false;
    const adminEmails = ["aidanpds@proton.me"];
    return adminEmails.includes(user.email ?? "");
  }
  ```

**`middleware.ts`**
- Replace NextAuth middleware with Supabase session refresh
- Same pattern as rhythm's middleware

**`app/api/admin/login/route.ts`** + **`app/api/admin/logout/route.ts`**
- Remove (Supabase handles auth flow)

**`app/auth/signin/page.tsx`** + **`app/auth/signout/page.tsx`**
- Replace with Supabase login/logout pages (same UI as rhythm)

**`lib/data.ts`**
- All queries switch from Drizzle to Supabase client
- `db.query.users.findFirst(...)` → `supabase.from('store_creations').select(...)`

**`lib/actions.ts`**
- All mutations switch from Drizzle to Supabase client
- Session check changes from `getServerSession` to Supabase `getUser()`

**All components using `useSession()` or session data**
- Switch to Supabase `useUser()` hook from `@supabase/ssr`

---

## Phase 4: Data Migration Execution

### Pre-flight checklist
- [ ] Get rhythm's Supabase URL, anon key, service role key
- [ ] Get creations-store Turso URL + auth token
- [ ] Dump both user email lists, compare
- [ ] Backup Turso database
- [ ] Run Phase 1 SQL migration on Supabase

### Migration order (dependency-safe)
1. Create `auth.users` entries for missing users
2. Insert categories
3. Insert creations (depends on users)
4. Insert screenshots (depends on creations)
5. Insert reviews (depends on creations + users)
6. Insert clicks (depends on creations)
7. Insert installs (depends on creations)
8. Insert views (depends on creations)
9. Insert daily stats (depends on creations)

### Post-migration verification
- Row counts match between Turso and Supabase for every table
- Spot-check 5 random creations: verify title, URL, user_id, screenshots
- Spot-check 5 users: verify they can log into creations-store with Supabase auth
- Test: create a new creation as a migrated user
- Test: view analytics page for a migrated creation

---

## Validation Plan

| Check | How | When |
|-------|-----|------|
| SQL migration applies cleanly | Run in Supabase SQL editor | Before data migration |
| All tables exist with correct columns | `SELECT column_name FROM information_schema.columns` | After Phase 1 |
| RLS blocks unauthorized writes | Try inserting without auth → should fail | After Phase 1 |
| User merge count correct | Compare Turso user count vs auth.users delta | After Phase 2 |
| No orphaned creations (user_id = null unexpectedly) | `SELECT count(*) WHERE user_id IS NULL` | After data migration |
| Row counts match | Turso count vs Supabase count per table | After data migration |
| creations-store builds | `pnpm build` with new auth | After Phase 3 |
| Login works | Discord OAuth + email/password | After Phase 3 |
| CRUD works | Create/edit/delete a creation | After Phase 3 |

---

## What I Need From You

1. **Supabase credentials** from rhythm's project:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

2. **Turso credentials** from creations-store:
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`

3. **Confirmation on admin strategy** — admin by email allowlist (my recommendation) vs admin by Discord ID vs admin column in public.users

4. **Go/no-go** on the plan before I start writing code

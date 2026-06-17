import { createAdminClient } from "@/lib/supabase/admin";
import { generateSlug, generateProxyCode } from "@/lib/utils";
import { guard, json, apiError, preflight } from "@/lib/api/respond";
import { serializeCreation } from "@/lib/api/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CDN_HOST = (() => {
  try {
    return process.env.S3_PUBLIC_URL
      ? new URL(process.env.S3_PUBLIC_URL).hostname
      : "cdn.boondit.site";
  } catch {
    return "cdn.boondit.site";
  }
})();

function isCdnUrl(url: string): boolean {
  if (!url) return true;
  try {
    return new URL(url).hostname === CDN_HOST;
  } catch {
    return false;
  }
}
function isHttpUrl(url: string): boolean {
  try {
    const p = new URL(url);
    return p.protocol === "http:" || p.protocol === "https:";
  } catch {
    return false;
  }
}

export function OPTIONS() {
  return preflight();
}

// GET /api/v1/creations — list PUBLISHED creations (public, paginated).
// Query: ?limit=1..100 &offset &category=<slug> &q=<title search>
export async function GET(req: Request) {
  const g = await guard(req, { mode: "read" });
  if ("error" in g) return g.error;
  const { rl } = g.ctx;

  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 20));
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const category = url.searchParams.get("category")?.trim();
  const q = url.searchParams.get("q")?.trim();

  const supabase = createAdminClient();
  let query = supabase
    .from("store_creations")
    .select("*, store_categories(*), users(id, username, avatar_url, created_at)", {
      count: "exact",
    })
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (q) query = query.ilike("title", `%${q}%`);
  if (category) {
    // Resolve category slug → id.
    const { data: cat } = await supabase
      .from("store_categories")
      .select("id")
      .eq("slug", category)
      .single();
    if (cat) query = query.eq("category_id", cat.id);
    else return json({ data: [], pagination: { limit, offset, total: 0 } }, { rl });
  }

  const { data, count, error } = await query;
  if (error) return apiError("server_error", "Failed to list creations.", 500, rl);

  const mapRow = (row: any) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    url: row.url,
    description: row.description,
    overview: row.overview,
    iconUrl: row.icon_url,
    ogImage: row.og_image,
    themeColor: row.theme_color,
    author: row.author,
    screenshotUrl: row.screenshot_url,
    status: row.status,
    views: row.views,
    proxyCode: row.proxy_code,
    categoryId: row.category_id,
    category: row.store_categories
      ? { id: row.store_categories.id, name: row.store_categories.name, slug: row.store_categories.slug }
      : null,
    user: row.users
      ? { id: row.users.id, username: row.users.username, avatarUrl: row.users.avatar_url }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  return json(
    {
      data: (data || []).map(mapRow),
      pagination: { limit, offset, total: count ?? 0 },
    },
    { rl },
  );
}

// POST /api/v1/creations — create a creation owned by the API key's user.
// Requires the 'write' scope. Body: { title, url, description?, overview?,
// iconUrl?, ogImage?, themeColor?, author?, screenshotUrl?, categoryId?,
// status? ("draft"|"published", default "draft") }
export async function POST(req: Request) {
  const g = await guard(req, { mode: "write" });
  if ("error" in g) return g.error;
  const { key, rl } = g.ctx;

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return apiError("invalid_body", "Request body must be valid JSON.", 400, rl);
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const urlVal = typeof body.url === "string" ? body.url.trim() : "";
  if (!title) return apiError("invalid_body", "`title` is required.", 422, rl);
  if (!isHttpUrl(urlVal))
    return apiError("invalid_body", "`url` must be a valid http(s) URL.", 422, rl);

  const iconUrl = typeof body.iconUrl === "string" ? body.iconUrl.trim() : "";
  if (iconUrl && !isCdnUrl(iconUrl))
    return apiError(
      "invalid_icon",
      `iconUrl must be hosted on the Boondit CDN (${CDN_HOST}).`,
      422,
      rl,
    );

  const status = body.status === "published" ? "published" : "draft";
  const themeColor =
    typeof body.themeColor === "string" && /^#[0-9a-fA-F]{6}$/.test(body.themeColor)
      ? body.themeColor
      : "#fe5000";

  const supabase = createAdminClient();
  const slug = generateSlug(title) || generateProxyCode();

  const { data, error } = await supabase
    .from("store_creations")
    .insert({
      title,
      slug,
      url: urlVal,
      description: typeof body.description === "string" ? body.description : null,
      overview: typeof body.overview === "string" ? body.overview : null,
      icon_url: iconUrl || null,
      og_image: typeof body.ogImage === "string" ? body.ogImage : null,
      theme_color: themeColor,
      author: typeof body.author === "string" ? body.author : null,
      screenshot_url: typeof body.screenshotUrl === "string" ? body.screenshotUrl : null,
      category_id: typeof body.categoryId === "string" ? body.categoryId : null,
      user_id: key!.userId,
      status,
      proxy_code: generateProxyCode(),
    })
    .select("*, store_categories(*), users(id, username, avatar_url, created_at)")
    .single();

  if (error) {
    // Unique slug/url collisions surface as 409.
    if (error.code === "23505")
      return apiError("conflict", "A creation with that slug or URL already exists.", 409, rl);
    return apiError("server_error", "Failed to create creation.", 500, rl);
  }

  return json(
    {
      data: serializeCreation({
        ...mapInserted(data),
      }),
    },
    { status: 201, rl },
  );
}

function mapInserted(row: any) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    url: row.url,
    description: row.description,
    overview: row.overview,
    iconUrl: row.icon_url,
    ogImage: row.og_image,
    themeColor: row.theme_color,
    author: row.author,
    screenshotUrl: row.screenshot_url,
    status: row.status,
    views: row.views,
    proxyCode: row.proxy_code,
    categoryId: row.category_id,
    category: row.store_categories
      ? { id: row.store_categories.id, name: row.store_categories.name, slug: row.store_categories.slug }
      : null,
    user: row.users
      ? { id: row.users.id, username: row.users.username, avatarUrl: row.users.avatar_url }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

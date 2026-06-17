import { createAdminClient } from "@/lib/supabase/admin";
import { guard, json, apiError, preflight } from "@/lib/api/respond";
import { serializeCreation } from "@/lib/api/serialize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CDN_HOST = (() => {
  try {
    return process.env.S3_PUBLIC_URL ? new URL(process.env.S3_PUBLIC_URL).hostname : "cdn.boondit.site";
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

function mapRow(row: any) {
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
    userId: row.user_id,
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

async function fetchByIdOrSlug(idOrSlug: string) {
  const supabase = createAdminClient();
  const column = UUID_RE.test(idOrSlug) ? "id" : "slug";
  const { data } = await supabase
    .from("store_creations")
    .select("*, store_categories(*), users(id, username, avatar_url, created_at)")
    .eq(column, idOrSlug)
    .single();
  return data ? mapRow(data) : null;
}

export function OPTIONS() {
  return preflight();
}

// GET /api/v1/creations/:idOrSlug — public for published; owner-only for drafts.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guard(req, { mode: "read" });
  if ("error" in g) return g.error;
  const { key, rl } = g.ctx;
  const { id } = await params;

  const row = await fetchByIdOrSlug(id);
  if (!row) return apiError("not_found", "Creation not found.", 404, rl);

  // Drafts must never be visible to anyone but the owning key — this also
  // closes the pre-existing draft-by-id/slug read leak.
  if (row.status !== "published" && (!key || key.userId !== row.userId)) {
    return apiError("not_found", "Creation not found.", 404, rl);
  }

  const { userId: _omit, ...rest } = row;
  return json({ data: serializeCreation(rest) }, { rl });
}

// PATCH /api/v1/creations/:idOrSlug — owner-only update (write scope).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guard(req, { mode: "write" });
  if ("error" in g) return g.error;
  const { key, rl } = g.ctx;
  const { id } = await params;

  const row = await fetchByIdOrSlug(id);
  if (!row) return apiError("not_found", "Creation not found.", 404, rl);
  if (row.userId !== key!.userId)
    return apiError("forbidden", "You do not own this creation.", 403, rl);

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return apiError("invalid_body", "Request body must be valid JSON.", 400, rl);
  }

  const update: Record<string, any> = {};
  if (typeof body.title === "string") update.title = body.title.trim();
  if (typeof body.description === "string") update.description = body.description;
  if (typeof body.overview === "string") update.overview = body.overview;
  if (typeof body.author === "string") update.author = body.author;
  if (typeof body.screenshotUrl === "string") update.screenshot_url = body.screenshotUrl;
  if (typeof body.categoryId === "string") update.category_id = body.categoryId;
  if (typeof body.ogImage === "string") update.og_image = body.ogImage;
  if (typeof body.themeColor === "string") {
    if (!/^#[0-9a-fA-F]{6}$/.test(body.themeColor))
      return apiError("invalid_body", "themeColor must be a #rrggbb hex color.", 422, rl);
    update.theme_color = body.themeColor;
  }
  if (typeof body.url === "string") {
    if (!isHttpUrl(body.url))
      return apiError("invalid_body", "url must be a valid http(s) URL.", 422, rl);
    update.url = body.url.trim();
  }
  if (typeof body.iconUrl === "string") {
    if (body.iconUrl && !isCdnUrl(body.iconUrl))
      return apiError("invalid_icon", `iconUrl must be hosted on the Boondit CDN (${CDN_HOST}).`, 422, rl);
    update.icon_url = body.iconUrl || null;
  }
  if (body.status === "draft" || body.status === "published") update.status = body.status;

  if (Object.keys(update).length === 0)
    return apiError("invalid_body", "No updatable fields provided.", 422, rl);
  update.updated_at = new Date().toISOString();

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("store_creations")
    .update(update)
    .eq("id", row.id)
    .select("*, store_categories(*), users(id, username, avatar_url, created_at)")
    .single();

  if (error) {
    if (error.code === "23505")
      return apiError("conflict", "That change collides with an existing creation.", 409, rl);
    return apiError("server_error", "Failed to update creation.", 500, rl);
  }

  const { userId: _o, ...rest } = mapRow(data);
  return json({ data: serializeCreation(rest) }, { rl });
}

// DELETE /api/v1/creations/:idOrSlug — owner-only (write scope).
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guard(req, { mode: "write" });
  if ("error" in g) return g.error;
  const { key, rl } = g.ctx;
  const { id } = await params;

  const row = await fetchByIdOrSlug(id);
  if (!row) return apiError("not_found", "Creation not found.", 404, rl);
  if (row.userId !== key!.userId)
    return apiError("forbidden", "You do not own this creation.", 403, rl);

  const supabase = createAdminClient();
  const { error } = await supabase.from("store_creations").delete().eq("id", row.id);
  if (error) return apiError("server_error", "Failed to delete creation.", 500, rl);

  return json({ data: { id: row.id, deleted: true } }, { rl });
}

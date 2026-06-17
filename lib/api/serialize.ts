// Public DTO for a creation. Deliberately omits internal/owner-only fields
// (notes, is_archived, is_favorite, search_results, flag_reason, legacy_id) so
// the API never leaks moderation or private bookkeeping data.

type AnyCreation = Record<string, any>;

export function serializeCreation(c: AnyCreation) {
  return {
    id: c.id,
    title: c.title,
    slug: c.slug,
    url: c.url,
    description: c.description ?? null,
    overview: c.overview ?? null,
    iconUrl: c.iconUrl ?? null,
    ogImage: c.ogImage ?? null,
    themeColor: c.themeColor ?? null,
    author: c.author ?? null,
    screenshotUrl: c.screenshotUrl ?? null,
    status: c.status,
    views: c.views ?? 0,
    proxyCode: c.proxyCode ?? null,
    categoryId: c.categoryId ?? null,
    category: c.category
      ? { id: c.category.id, name: c.category.name, slug: c.category.slug }
      : null,
    user: c.user
      ? { id: c.user.id, username: c.user.username, avatarUrl: c.user.avatarUrl }
      : null,
    screenshots: Array.isArray(c.screenshots)
      ? c.screenshots.map((s: AnyCreation) => ({ id: s.id, url: s.url, isMain: s.isMain }))
      : undefined,
    averageRating: c.averageRating ?? undefined,
    createdAt: c.createdAt ?? null,
    updatedAt: c.updatedAt ?? null,
  };
}

export function serializeCategory(c: AnyCreation) {
  return { id: c.id, name: c.name, slug: c.slug, description: c.description ?? null };
}

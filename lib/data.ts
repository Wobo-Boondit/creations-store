import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================
// Types (camelCase to match old Drizzle schema)
// ============================================================

export type Creation = {
  id: string;
  legacyId: number | null;
  url: string;
  title: string;
  slug: string;
  description: string | null;
  categoryId: string | null;
  tags: string | null;
  userId: string | null;
  status: "draft" | "published";
  iconUrl: string | null;
  themeColor: string | null;
  author: string | null;
  screenshotUrl: string | null;
  favicon: string | null;
  screenshot: string | null;
  overview: string | null;
  ogImage: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  createdAt: string;
  updatedAt: string;
  lastVisited: string | null;
  notes: string | null;
  isArchived: boolean;
  isFavorite: boolean;
  searchResults: string | null;
  views: number;
  proxyCode: string | null;
  isFlagged: boolean;
  flagReason: string | null;
};

export type Category = {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  color: string | null;
  icon: string | null;
  legacyId: string | null;
};

export type User = {
  id: string;
  username: string;
  avatarUrl: string | null;
  createdAt: string;
};

export type CreationScreenshot = {
  id: string;
  creationId: string;
  url: string;
  isMain: boolean;
  createdAt: string;
};

export type CreationReview = {
  id: string;
  creationId: string;
  userId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreationReviewWithUser = CreationReview & { user: User };

export type Bookmark = Creation;

// ============================================================
// Helper: transform raw Supabase row to camelCase Creation
// ============================================================
function mapCreation(row: any): Creation {
  return {
    id: row.id,
    legacyId: row.legacy_id,
    url: row.url,
    title: row.title,
    slug: row.slug,
    description: row.description,
    categoryId: row.category_id,
    tags: row.tags,
    userId: row.user_id,
    status: row.status,
    iconUrl: row.icon_url,
    themeColor: row.theme_color,
    author: row.author,
    screenshotUrl: row.screenshot_url,
    favicon: row.favicon,
    screenshot: row.screenshot,
    overview: row.overview,
    ogImage: row.og_image,
    ogTitle: row.og_title,
    ogDescription: row.og_description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastVisited: row.last_visited,
    notes: row.notes,
    isArchived: row.is_archived,
    isFavorite: row.is_favorite,
    searchResults: row.search_results,
    views: row.views,
    proxyCode: row.proxy_code,
    isFlagged: row.is_flagged,
    flagReason: row.flag_reason,
  };
}

function mapCategory(row: any): Category {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    slug: row.slug,
    color: row.color,
    icon: row.icon,
    legacyId: row.legacy_id,
  };
}

function mapUser(row: any): User | null {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
  };
}

function mapScreenshot(row: any): CreationScreenshot {
  return {
    id: row.id,
    creationId: row.creation_id,
    url: row.url,
    isMain: row.is_main,
    createdAt: row.created_at,
  };
}

// ============================================================
// Helper: get admin client
// ============================================================
function db() {
  return createAdminClient();
}

// ============================================================
// Creation queries
// ============================================================

export async function getAllCreations(): Promise<(Creation & { category: Category | null; user: User | null })[]> {
  const supabase = db();
  const { data } = await supabase
    .from("store_creations")
    .select("*, store_categories(*), users(id, username, avatar_url, created_at)")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  return (data || []).map((row: any) => ({
    ...mapCreation(row),
    category: row.store_categories ? mapCategory(row.store_categories) : null,
    user: mapUser(row.users),
  }));
}

export async function getAllCategories(): Promise<Category[]> {
  const supabase = db();
  const { data } = await supabase
    .from("store_categories")
    .select("*")
    .order("name", { ascending: true });

  return (data || []).map(mapCategory);
}

export async function getCreationById(id: string): Promise<(Creation & { category: Category | null; user: User | null; screenshots: CreationScreenshot[]; averageRating: { average: number; count: number } | null }) | null> {
  const supabase = db();
  const { data } = await supabase
    .from("store_creations")
    .select("*, store_categories(*), users(id, username, avatar_url, created_at)")
    .eq("id", id)
    .single();

  if (!data) return null;

  const screenshots = await getCreationScreenshots(id);
  const averageRating = await getCreationAverageRating(id);

  return {
    ...mapCreation(data),
    category: data.store_categories ? mapCategory(data.store_categories) : null,
    user: mapUser(data.users),
    screenshots,
    averageRating,
  };
}

export async function getCreationBySlug(slug: string): Promise<(Creation & { category: Category | null; user: User | null; screenshots: CreationScreenshot[]; averageRating: { average: number; count: number } | null }) | null> {
  const supabase = db();
  const { data } = await supabase
    .from("store_creations")
    .select("*, store_categories(*), users(id, username, avatar_url, created_at)")
    .eq("slug", slug)
    .single();

  if (!data) return null;

  const screenshots = await getCreationScreenshots(data.id);
  const averageRating = await getCreationAverageRating(data.id);

  return {
    ...mapCreation(data),
    category: data.store_categories ? mapCategory(data.store_categories) : null,
    user: mapUser(data.users),
    screenshots,
    averageRating,
  };
}

export async function incrementCreationViews(id: string, sessionId?: string): Promise<void> {
  const supabase = db();
  const session = sessionId || "anonymous";

  // Check if this session viewed in the last hour.
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
  const { data: recentView, error: lookupErr } = await supabase
    .from("store_views")
    .select("id")
    .eq("creation_id", id)
    .eq("session_id", session)
    .gt("viewed_at", oneHourAgo)
    .limit(1);

  // If we can't read the dedup table, don't increment — counting without
  // working dedup is what makes the counter climb on every refresh.
  if (lookupErr) {
    console.error("[data] incrementCreationViews: dedup lookup failed:", lookupErr.message);
    return;
  }

  if (recentView && recentView.length > 0) return;

  // Record the view FIRST and confirm it persisted. If the insert fails
  // (schema/constraint/RLS), bail without bumping the count — otherwise the
  // dedup row never lands and every subsequent refresh counts again.
  const { error: insertErr } = await supabase.from("store_views").insert({
    creation_id: id,
    session_id: session,
    viewed_at: new Date().toISOString(),
  });

  if (insertErr) {
    console.error("[data] incrementCreationViews: view insert failed:", insertErr.message);
    return;
  }

  // Dedup row is durable — now bump the denormalized counter.
  const { data: current } = await supabase
    .from("store_creations")
    .select("views")
    .eq("id", id)
    .single();

  if (current) {
    await supabase
      .from("store_creations")
      .update({ views: (current.views || 0) + 1 })
      .eq("id", id);
  }
}

export async function getUserCreations(userId: string): Promise<(Creation & { category: Category | null })[]> {
  const supabase = db();
  const { data } = await supabase
    .from("store_creations")
    .select("*, store_categories(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return (data || []).map((row: any) => ({
    ...mapCreation(row),
    category: row.store_categories ? mapCategory(row.store_categories) : null,
  }));
}

export async function getUserDrafts(userId: string): Promise<(Creation & { category: Category | null })[]> {
  const supabase = db();
  const { data } = await supabase
    .from("store_creations")
    .select("*, store_categories(*)")
    .eq("user_id", userId)
    .eq("status", "draft")
    .order("created_at", { ascending: false });

  return (data || []).map((row: any) => ({
    ...mapCreation(row),
    category: row.store_categories ? mapCategory(row.store_categories) : null,
  }));
}

export async function getPublishedCreations(): Promise<(Creation & { category: Category | null; user: User | null; averageRating: { average: number; count: number } | null })[]> {
  const supabase = db();
  const { data } = await supabase
    .from("store_creations")
    .select("*, store_categories(*), users(id, username, avatar_url, created_at)")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  // Get all ratings
  const { data: allReviews } = await supabase
    .from("store_reviews")
    .select("creation_id, rating");

  const ratingsMap = new Map<string, { average: number; count: number }>();
  if (allReviews) {
    for (const rv of allReviews) {
      const existing = ratingsMap.get(rv.creation_id);
      if (existing) {
        existing.average = Math.round(((existing.average * existing.count + rv.rating) / (existing.count + 1)) * 10) / 10;
        existing.count += 1;
      } else {
        ratingsMap.set(rv.creation_id, { average: rv.rating, count: 1 });
      }
    }
  }

  return (data || []).map((row: any) => ({
    ...mapCreation(row),
    category: row.store_categories ? mapCategory(row.store_categories) : null,
    user: mapUser(row.users),
    averageRating: ratingsMap.get(row.id) || null,
  }));
}

// ============================================================
// User queries
// ============================================================

export async function getUserById(userId: string): Promise<User | null> {
  const supabase = db();
  const { data } = await supabase
    .from("users")
    .select("id, username, avatar_url, created_at")
    .eq("id", userId)
    .single();

  return data ? mapUser(data) : null;
}

export async function getAllUsers(): Promise<(User & { creationCount: number })[]> {
  const supabase = db();
  const { data: allUsers } = await supabase
    .from("users")
    .select("id, username, avatar_url, created_at")
    .order("created_at", { ascending: false });

  if (!allUsers) return [];

  const { data: allCreations } = await supabase
    .from("store_creations")
    .select("user_id");

  const countMap = new Map<string, number>();
  if (allCreations) {
    for (const c of allCreations) {
      if (c.user_id) {
        countMap.set(c.user_id, (countMap.get(c.user_id) || 0) + 1);
      }
    }
  }

  return allUsers.map((user: any) => ({
    ...mapUser(user)!,
    creationCount: countMap.get(user.id) || 0,
  }));
}

export async function getUserProfile(userId: string) {
  const user = await getUserById(userId);
  if (!user) return null;

  const supabase = db();
  const { data: publishedCreations } = await supabase
    .from("store_creations")
    .select("*, store_categories(*)")
    .eq("user_id", userId)
    .eq("status", "published")
    .order("created_at", { ascending: false });

  return {
    ...user,
    creationCount: publishedCreations?.length || 0,
    creations: (publishedCreations || []).map((row: any) => ({
      ...mapCreation(row),
      category: row.store_categories ? mapCategory(row.store_categories) : null,
    })),
  };
}

// ============================================================
// Screenshot queries
// ============================================================

export async function getCreationScreenshots(creationId: string): Promise<CreationScreenshot[]> {
  const supabase = db();
  const { data } = await supabase
    .from("store_screenshots")
    .select("*")
    .eq("creation_id", creationId)
    .order("created_at", { ascending: true });

  return (data || []).map(mapScreenshot);
}

export async function getMainScreenshot(creationId: string): Promise<CreationScreenshot | null> {
  const supabase = db();
  const { data } = await supabase
    .from("store_screenshots")
    .select("*")
    .eq("creation_id", creationId)
    .eq("is_main", true)
    .limit(1);

  return data?.[0] ? mapScreenshot(data[0]) : null;
}

export async function addScreenshot(creationId: string, url: string, isMain: boolean = false): Promise<CreationScreenshot | null> {
  const supabase = db();
  const { data } = await supabase
    .from("store_screenshots")
    .insert({
      creation_id: creationId,
      url,
      is_main: isMain,
    })
    .select()
    .single();

  return data ? mapScreenshot(data) : null;
}

export async function deleteScreenshot(screenshotId: string): Promise<void> {
  const supabase = db();
  await supabase.from("store_screenshots").delete().eq("id", screenshotId);
}

export async function setMainScreenshotDb(screenshotId: string, creationId: string): Promise<void> {
  const supabase = db();

  // Unset all main screenshots for this creation
  await supabase
    .from("store_screenshots")
    .update({ is_main: false })
    .eq("creation_id", creationId);

  // Set the new main
  await supabase
    .from("store_screenshots")
    .update({ is_main: true })
    .eq("id", screenshotId);

  // Update creation's screenshot_url
  const { data: screenshot } = await supabase
    .from("store_screenshots")
    .select("url")
    .eq("id", screenshotId)
    .single();

  if (screenshot) {
    await supabase
      .from("store_creations")
      .update({ screenshot_url: screenshot.url })
      .eq("id", creationId);
  }
}

// Alias for backward compatibility with API routes
export const setMainScreenshot = setMainScreenshotDb;

// ============================================================
// Review queries
// ============================================================

export async function getCreationReviews(creationId: string): Promise<CreationReviewWithUser[]> {
  const supabase = db();
  const { data } = await supabase
    .from("store_reviews")
    .select("*, users(id, username, avatar_url, created_at)")
    .eq("creation_id", creationId)
    .order("created_at", { ascending: false });

  return (data || []).map((row: any) => ({
    id: row.id,
    creationId: row.creation_id,
    userId: row.user_id,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    user: mapUser(row.users)!,
  }));
}

export async function getCreationAverageRating(creationId: string): Promise<{ average: number; count: number } | null> {
  const supabase = db();
  const { data } = await supabase
    .from("store_reviews")
    .select("rating")
    .eq("creation_id", creationId);

  if (!data || data.length === 0) return null;

  const sum = data.reduce((acc, r) => acc + r.rating, 0);
  return {
    average: Math.round((sum / data.length) * 10) / 10,
    count: data.length,
  };
}

export async function getUserReviewForCreation(creationId: string, userId: string): Promise<CreationReview | null> {
  const supabase = db();
  const { data } = await supabase
    .from("store_reviews")
    .select("*")
    .eq("creation_id", creationId)
    .eq("user_id", userId)
    .limit(1);

  if (!data?.[0]) return null;
  return {
    id: data[0].id,
    creationId: data[0].creation_id,
    userId: data[0].user_id,
    rating: data[0].rating,
    comment: data[0].comment,
    createdAt: data[0].created_at,
    updatedAt: data[0].updated_at,
  };
}

export async function createReview(creationId: string, userId: string, rating: number, comment?: string): Promise<CreationReview | null> {
  const supabase = db();
  const { data } = await supabase
    .from("store_reviews")
    .insert({
      creation_id: creationId,
      user_id: userId,
      rating,
      comment: comment || null,
    })
    .select()
    .single();

  if (!data) return null;
  return {
    id: data.id,
    creationId: data.creation_id,
    userId: data.user_id,
    rating: data.rating,
    comment: data.comment,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function updateReview(reviewId: string, rating: number, comment?: string): Promise<CreationReview | null> {
  const supabase = db();
  const { data } = await supabase
    .from("store_reviews")
    .update({
      rating,
      comment: comment || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", reviewId)
    .select()
    .single();

  if (!data) return null;
  return {
    id: data.id,
    creationId: data.creation_id,
    userId: data.user_id,
    rating: data.rating,
    comment: data.comment,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function deleteReview(reviewId: string): Promise<void> {
  const supabase = db();
  await supabase.from("store_reviews").delete().eq("id", reviewId);
}

// ============================================================
// Legacy aliases for backward compatibility
// ============================================================
export const getAllBookmarks = getAllCreations;
export const getBookmarkById = getCreationById;
export const getBookmarkBySlug = getCreationBySlug;
export const getPublishedBookmarks = getPublishedCreations;

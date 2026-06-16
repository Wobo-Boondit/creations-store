"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { generateSlug, generateProxyCode } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";

export type ActionState = {
  success?: boolean;
  error?: string;
  message?: string;
  data?: any;
  progress?: {
    current: number;
    total: number;
    currentUrl?: string;
    lastAdded?: string;
  };
};

/**
 * Validate that an image URL comes from our own CDN.
 * Non-CDN URLs are rejected to prevent SSRF and external dependency.
 */
function isCdnUrl(url: string): boolean {
  if (!url) return true; // empty is fine
  try {
    const parsed = new URL(url);
    const cdnHost = process.env.S3_PUBLIC_URL
      ? new URL(process.env.S3_PUBLIC_URL).hostname
      : "cdn.boondit.site";
    return parsed.hostname === cdnHost;
  } catch {
    return false;
  }
}

/**
 * Validate that a creation URL uses http/https scheme.
 * Prevents javascript:, data:, file: schemes that enable XSS / open redirect.
 */
function isValidCreationUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// Helper function to fetch metadata for bulk upload
async function generateContent(url: string) {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/metadata?url=${encodeURIComponent(url)}`);

    if (!response.ok) {
      return { error: "Failed to fetch metadata" };
    }

    const metadata = await response.json();

    if (metadata.error) {
      return { error: metadata.error };
    }

    const slug = generateSlug(metadata.title);

    return {
      title: metadata.title,
      description: metadata.description,
      url: metadata.url,
      overview: "",
      searchResults: "",
      iconUrl: "", // icons must be uploaded to our CDN, not scraped from favicons
      ogImage: metadata.ogImage,
      slug,
      error: null,
    };
  } catch (error) {
    console.error("Error generating content:", error);
    return { error: "Failed to generate content" };
  }
}

type CreationData = {
  title: string;
  description: string;
  url: string;
  overview: string;
  searchResults: string;
  iconUrl: string;
  ogImage: string;
  slug: string;
  themeColor: string;
  author: string;
  screenshotUrl: string;
  categoryId: string | null;
  isFavorite: boolean;
  isArchived: boolean;
};

// ============================================================
// User Actions
// ============================================================

export async function updateProfile(
  prevState: ActionState | null,
  formData: { username: string },
): Promise<ActionState> {
  try {
    const sessionUser = await getCurrentUser();
    if (!sessionUser) {
      return { error: "Unauthorized" };
    }

    const username = formData.username?.trim();
    if (!username || username.length < 2) {
      return { error: "Username must be at least 2 characters" };
    }
    if (username.length > 32) {
      return { error: "Username must be 32 characters or less" };
    }

    const admin = createAdminClient();

    // Update the profile in public.users
    const { error } = await admin
      .from("users")
      .update({ username })
      .eq("id", sessionUser.id);

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/settings");
    return { success: true };
  } catch (err) {
    console.error("Error updating profile:", err);
    return { error: "Failed to update profile" };
  }
}

export async function registerUser(
  prevState: ActionState | null,
  formData: { email: string; password: string; name: string },
): Promise<ActionState> {
  // Admin-only — prevents unauthenticated account pre-hijacking
  const adminCheck = await isAdmin();
  if (!adminCheck) {
    return { error: "Unauthorized" };
  }

  try {
    const { email, password, name } = formData;
    const admin = createAdminClient();

    // Check if user exists
    const { data: existing } = await admin
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      return { error: "User already exists" };
    }

    // Create auth user
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });

    if (authError) {
      return { error: authError.message };
    }

    // Create profile in public.users
    await admin.from("users").insert({
      id: authData.user.id,
      email,
      username: name.toLowerCase().replace(/[^a-z0-9_-]/g, "_"),
      display_name: name,
    });

    return { success: true, data: { userId: authData.user.id } };
  } catch (error) {
    console.error("Error registering user:", error);
    return { error: "Failed to register user" };
  }
}

export async function updateUserProfile(
  prevState: ActionState | null,
  formData: { userId: string; name: string; bio: string; avatar: string },
): Promise<ActionState> {
  try {
    const sessionUser = await getCurrentUser();
    if (!sessionUser) {
      return { error: "Unauthorized" };
    }
    const userId = sessionUser.id;
    const { name, bio, avatar } = formData;
    const admin = createAdminClient();

    await admin
      .from("users")
      .update({
        display_name: name,
        bio,
        avatar_url: avatar,
      })
      .eq("id", userId);

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Error updating profile:", error);
    return { error: "Failed to update profile" };
  }
}

// ============================================================
// Category Actions
// ============================================================

export async function createCategory(
  prevState: ActionState | null,
  formData: {
    name: string;
    description: string;
    slug: string;
    color: string;
    icon: string;
  },
): Promise<ActionState> {
  try {
    if (!(await isAdmin())) {
      return { error: "Unauthorized" };
    }
    const { name, description, slug, color, icon } = formData;
    const admin = createAdminClient();

    const { error } = await admin.from("store_categories").insert({
      name,
      description,
      slug,
      color,
      icon,
    });

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/admin");
    revalidatePath("/");
    return { success: true };
  } catch (err) {
    console.error("Error creating category:", err);
    return { error: "Failed to create category" };
  }
}

export async function updateCategory(
  prevState: ActionState | null,
  formData: {
    id: string;
    name: string;
    description: string;
    slug: string;
    color: string;
    icon: string;
  },
): Promise<ActionState> {
  try {
    if (!(await isAdmin())) {
      return { error: "Unauthorized" };
    }
    if (!formData) {
      return { error: "No form data provided" };
    }

    const { id, name, description, slug, color, icon } = formData;
    if (!id) {
      return { error: "No category ID provided" };
    }

    const admin = createAdminClient();

    const { error } = await admin
      .from("store_categories")
      .update({ name, description, slug, color, icon })
      .eq("id", id);

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/admin");
    revalidatePath("/");
    return { success: true };
  } catch (err) {
    console.error("Error updating category:", err);
    return { error: "Failed to update category" };
  }
}

export async function deleteCategory(
  prevState: ActionState | null,
  formData: {
    id: string;
  },
): Promise<ActionState> {
  try {
    if (!(await isAdmin())) {
      return { error: "Unauthorized" };
    }
    if (!formData) {
      return { error: "No form data provided" };
    }

    const { id } = formData;
    if (!id) {
      return { error: "No category ID provided" };
    }

    const admin = createAdminClient();

    const { error } = await admin
      .from("store_categories")
      .delete()
      .eq("id", id);

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/admin");
    revalidatePath("/");
    return { success: true };
  } catch (err) {
    console.error("Error deleting category:", err);
    return { error: "Failed to delete category" };
  }
}

// ============================================================
// Creation Actions
// ============================================================

export async function createCreation(
  prevState: ActionState | null,
  formData: {
    title: string;
    description: string;
    url: string;
    slug: string;
    overview: string;
    iconUrl: string;
    ogImage: string;
    searchResults: string;
    themeColor: string;
    author: string;
    screenshotUrl: string;
    categoryId: string;
    isFavorite: string;
    isArchived: string;
    userId: string;
    status?: "draft" | "published";
  },
): Promise<ActionState> {
  try {
    const sessionUser = await getCurrentUser();
    if (!sessionUser) {
      return { error: "Unauthorized" };
    }
    const admin = createAdminClient();

    // Validate icon URL comes from our CDN
    if (formData.iconUrl && !isCdnUrl(formData.iconUrl)) {
      return { error: "Icon must be uploaded through Boondit CDN" };
    }

    // Validate creation URL scheme (prevent javascript:/data: XSS)
    if (!isValidCreationUrl(formData.url)) {
      return { error: "URL must be a valid http or https address" };
    }

    let slug = formData.slug;
    if (!slug) {
      slug = generateSlug(formData.title);
    }

    const { error } = await admin.from("store_creations").insert({
      title: formData.title,
      slug,
      url: formData.url,
      description: formData.description,
      category_id: formData.categoryId === "none" ? null : formData.categoryId,
      search_results: formData.searchResults || null,
      is_favorite: formData.isFavorite === "true",
      is_archived: formData.isArchived === "true",
      overview: formData.overview,
      icon_url: formData.iconUrl || null,
      og_image: formData.ogImage,
      theme_color: formData.themeColor,
      author: formData.author,
      screenshot_url: formData.screenshotUrl,
      user_id: sessionUser.id,
      status: formData.status || "draft",
      proxy_code: generateProxyCode(),
    });

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/admin");
    revalidatePath("/");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    console.error("Error creating creation:", err);
    return { error: "Failed to create creation" };
  }
}

export async function updateCreation(
  prevState: ActionState | null,
  formData: {
    id: string;
    title: string;
    description: string;
    url: string;
    slug: string;
    overview: string;
    iconUrl: string;
    ogImage: string;
    searchResults: string;
    themeColor: string;
    author: string;
    screenshotUrl: string;
    categoryId: string;
    isFavorite: string;
    isArchived: string;
    userId: string;
  },
): Promise<ActionState> {
  try {
    const sessionUser = await getCurrentUser();
    if (!sessionUser) {
      return { error: "Unauthorized" };
    }
    if (!formData) {
      return { error: "No form data provided" };
    }

    const { id } = formData;
    if (!id) {
      return { error: "No creation ID provided" };
    }

    const admin = createAdminClient();

    // Check ownership using server-derived user ID
    const { data: creation } = await admin
      .from("store_creations")
      .select("user_id")
      .eq("id", id)
      .maybeSingle();

    if (!creation) {
      return { error: "Creation not found" };
    }

    if (creation.user_id !== sessionUser.id) {
      return { error: "Unauthorized" };
    }

    // Validate icon URL comes from our CDN
    if (formData.iconUrl && !isCdnUrl(formData.iconUrl)) {
      return { error: "Icon must be uploaded through Boondit CDN" };
    }

    // Validate creation URL scheme (prevent javascript:/data: XSS)
    if (!isValidCreationUrl(formData.url)) {
      return { error: "URL must be a valid http or https address" };
    }

    let slug = formData.slug;
    if (!slug) {
      slug = generateSlug(formData.title);
    }

    const { error } = await admin
      .from("store_creations")
      .update({
        title: formData.title,
        slug,
        url: formData.url,
        description: formData.description,
        category_id: formData.categoryId === "none" ? null : formData.categoryId,
        search_results: formData.searchResults || null,
        overview: formData.overview,
        icon_url: formData.iconUrl,
        og_image: formData.ogImage,
        theme_color: formData.themeColor,
        author: formData.author,
        screenshot_url: formData.screenshotUrl,
        is_favorite: formData.isFavorite === "true",
        is_archived: formData.isArchived === "true",
      })
      .eq("id", id);

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/admin");
    revalidatePath("/");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    console.error("Error updating creation:", err);
    return { error: "Failed to update creation" };
  }
}

export async function publishCreation(
  prevState: ActionState | null,
  formData: { id: string; userId: string },
): Promise<ActionState> {
  try {
    const sessionUser = await getCurrentUser();
    if (!sessionUser) {
      return { error: "Unauthorized" };
    }

    const admin = createAdminClient();

    const { data: creation } = await admin
      .from("store_creations")
      .select("user_id")
      .eq("id", formData.id)
      .maybeSingle();

    if (!creation || creation.user_id !== sessionUser.id) {
      return { error: "Unauthorized" };
    }

    const { error } = await admin
      .from("store_creations")
      .update({ status: "published" })
      .eq("id", formData.id);

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/dashboard");
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("Error publishing creation:", error);
    return { error: "Failed to publish creation" };
  }
}

export async function deleteCreation(
  prevState: ActionState | null,
  formData: {
    id: string;
    url: string;
    userId: string;
  },
): Promise<ActionState> {
  try {
    if (!formData) {
      return { error: "No form data provided" };
    }

    const sessionUser = await getCurrentUser();
    if (!sessionUser) {
      return { error: "Unauthorized" };
    }

    const { id } = formData;
    if (!id) {
      return { error: "No creation ID provided" };
    }

    const admin = createAdminClient();

    // Check ownership using server-derived user ID
    const { data: creation } = await admin
      .from("store_creations")
      .select("user_id")
      .eq("id", id)
      .maybeSingle();

    if (!creation) {
      return { error: "Creation not found" };
    }

    if (creation.user_id !== sessionUser.id) {
      return { error: "Unauthorized" };
    }

    const { error } = await admin
      .from("store_creations")
      .delete()
      .eq("id", id);

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/admin");
    revalidatePath("/");
    revalidatePath("/dashboard");
    revalidatePath(`/${encodeURIComponent(formData.url)}`);
    return { success: true };
  } catch (err) {
    console.error("Error deleting creation:", err);
    return { error: "Failed to delete creation" };
  }
}

// ============================================================
// Screenshot Actions
// ============================================================

export async function addScreenshotToCreation(
  prevState: ActionState | null,
  formData: {
    creationId: string;
    url: string;
    isMain: string;
    userId: string;
  },
): Promise<ActionState> {
  try {
    const sessionUser = await getCurrentUser();
    if (!sessionUser) {
      return { error: "Unauthorized" };
    }

    const admin = createAdminClient();

    // Check ownership using server-derived user ID
    const { data: creation } = await admin
      .from("store_creations")
      .select("user_id")
      .eq("id", formData.creationId)
      .maybeSingle();

    if (!creation || creation.user_id !== sessionUser.id) {
      return { error: "Unauthorized" };
    }

    const isMain = formData.isMain === "true";

    // If setting as main, unset existing main
    if (isMain) {
      await admin
        .from("store_screenshots")
        .update({ is_main: false })
        .eq("creation_id", formData.creationId);
    }

    // Add screenshot
    const { data: screenshot, error } = await admin
      .from("store_screenshots")
      .insert({
        creation_id: formData.creationId,
        url: formData.url,
        is_main: isMain,
      })
      .select()
      .single();

    if (error) {
      return { error: error.message };
    }

    // Update creation's screenshotUrl if main
    if (isMain && screenshot) {
      await admin
        .from("store_creations")
        .update({ screenshot_url: screenshot.url })
        .eq("id", formData.creationId);
    }

    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/edit/${formData.creationId}`);
    return { success: true };
  } catch (error) {
    console.error("Error adding screenshot:", error);
    return { error: "Failed to add screenshot" };
  }
}

export async function setMainScreenshot(
  prevState: ActionState | null,
  formData: {
    screenshotId: string;
    creationId: string;
    userId: string;
  },
): Promise<ActionState> {
  try {
    const sessionUser = await getCurrentUser();
    if (!sessionUser) {
      return { error: "Unauthorized" };
    }

    const admin = createAdminClient();

    // Check ownership using server-derived user ID
    const { data: creation } = await admin
      .from("store_creations")
      .select("user_id")
      .eq("id", formData.creationId)
      .maybeSingle();

    if (!creation || creation.user_id !== sessionUser.id) {
      return { error: "Unauthorized" };
    }

    // Unset all main screenshots
    await admin
      .from("store_screenshots")
      .update({ is_main: false })
      .eq("creation_id", formData.creationId);

    // Set the new main
    await admin
      .from("store_screenshots")
      .update({ is_main: true })
      .eq("id", formData.screenshotId);

    // Get the screenshot URL
    const { data: screenshot } = await admin
      .from("store_screenshots")
      .select("url")
      .eq("id", formData.screenshotId)
      .single();

    if (screenshot) {
      await admin
        .from("store_creations")
        .update({ screenshot_url: screenshot.url })
        .eq("id", formData.creationId);
    }

    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/edit/${formData.creationId}`);
    return { success: true };
  } catch (error) {
    console.error("Error setting main screenshot:", error);
    return { error: "Failed to set main screenshot" };
  }
}

export async function removeScreenshot(
  prevState: ActionState | null,
  formData: {
    screenshotId: string;
    creationId: string;
    userId: string;
  },
): Promise<ActionState> {
  try {
    const sessionUser = await getCurrentUser();
    if (!sessionUser) {
      return { error: "Unauthorized" };
    }

    const admin = createAdminClient();

    // Check ownership using server-derived user ID
    const { data: creation } = await admin
      .from("store_creations")
      .select("user_id")
      .eq("id", formData.creationId)
      .maybeSingle();

    if (!creation || creation.user_id !== sessionUser.id) {
      return { error: "Unauthorized" };
    }

    const { error } = await admin
      .from("store_screenshots")
      .delete()
      .eq("id", formData.screenshotId);

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/edit/${formData.creationId}`);
    return { success: true };
  } catch (error) {
    console.error("Error removing screenshot:", error);
    return { error: "Failed to remove screenshot" };
  }
}

// ============================================================
// URL Scraping
// ============================================================

export async function scrapeUrl(
  prevState: ActionState | null,
  formData: {
    url: string;
  },
): Promise<ActionState> {
  // Require authentication
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" };

  try {
    const url = formData.url;
    if (!url) return { error: "URL is required" };

    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NODE_ENV === "development"
        ? "http://localhost:3000"
        : "";

    const metadataResponse = await fetch(
      `${baseUrl}/api/metadata?url=${encodeURIComponent(url)}`,
      { method: "GET" },
    );

    if (!metadataResponse.ok) {
      throw new Error("Failed to fetch metadata");
    }

    const metadata = await metadataResponse.json();

    return {
      success: true,
      data: {
        title: metadata.title || "",
        description: metadata.description || "",
        iconUrl: "", // icons must be uploaded to our CDN
        ogImage: metadata.ogImage || "",
        url: metadata.url || url,
      },
    };
  } catch (error) {
    console.error("Error scraping URL:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to scrape URL",
    };
  }
}

// ============================================================
// Bulk Upload
// ============================================================

export async function bulkUploadCreations(
  prevState: ActionState | null,
  formData: {
    urls: string;
  },
): Promise<ActionState> {
  try {
    if (!(await isAdmin())) {
      return { error: "Unauthorized" };
    }
    const admin = createAdminClient();

    const urls = formData.urls;
    if (!urls) {
      return { error: "No URLs provided" };
    }

    const urlList = urls.split("\n").filter((url) => url.trim());
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < urlList.length; i++) {
      const url = urlList[i].trim();
      if (!url) continue;

      try {
        const content = await generateContent(url);
        if (content.error) {
          errorCount++;
          continue;
        }

        const { error } = await admin.from("store_creations").insert({
          title: content.title,
          description: content.description,
          url: content.url,
          overview: content.overview || "",
          search_results: content.searchResults || null,
          icon_url: content.iconUrl || "",
          og_image: content.ogImage || "",
          slug: content.slug || generateSlug(content.title),
          theme_color: "",
          author: "",
          screenshot_url: "",
          category_id: null,
          is_favorite: false,
          is_archived: false,
          proxy_code: generateProxyCode(),
        });

        if (!error) {
          successCount++;
        }

        revalidatePath("/admin");
        revalidatePath("/[slug]");

        return {
          success: true,
          progress: {
            current: i + 1,
            total: urlList.length,
            lastAdded: content.title,
          },
        };
      } catch (error) {
        errorCount++;
        console.error(`Error processing URL ${url}:`, error);
      }
    }

    return {
      success: true,
      message: `Successfully imported ${successCount} creations. ${errorCount > 0 ? `Failed to import ${errorCount} URLs.` : ""}`,
      progress: {
        current: urlList.length,
        total: urlList.length,
      },
    };
  } catch (error) {
    console.error("Error in bulk upload:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to process bulk upload",
    };
  }
}

// ============================================================
// Helper
// ============================================================

type ErrorResponse = {
  message: string;
  status: number;
};

export async function handleError(
  error: Error | ErrorResponse,
): Promise<{ message: string }> {
  if (error instanceof Error) {
    return { message: error.message };
  } else {
    return { message: error.message };
  }
}

export async function signOut() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

// Legacy function aliases for backward compatibility
export const createBookmark = createCreation;
export const updateBookmark = updateCreation;
export const publishBookmark = publishCreation;
export const deleteBookmark = deleteCreation;
export const bulkUploadBookmarks = bulkUploadCreations;
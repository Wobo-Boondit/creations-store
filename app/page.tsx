// React + Next Imports
import React from "react";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

// Database Imports
import { getPublishedBookmarks, getAllCategories } from "@/lib/data";

// Component Imports
import { CreationCard } from "@/components/creation-card";
import { CreationGrid } from "@/components/creation-grid";
import { HorizontalScroll } from "@/components/horizontal-scroll";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileMenu } from "@/components/mobile-menu";

import { Sparkles, TrendingUp, Clock, FolderKanban } from "lucide-react";

export default async function Home({
  searchParams,
}: {
  searchParams: { category?: string; search?: string; sort?: string };
}) {
  const [bookmarks, categories] = await Promise.all([
    getPublishedBookmarks(),
    getAllCategories(),
  ]);

  const filteredBookmarks = bookmarks
    .filter(
      (bookmark) =>
        !searchParams.category ||
        bookmark.category?.id.toString() === searchParams.category,
    )
    .filter((bookmark) => {
      if (!searchParams.search) return true;
      const searchTerm = searchParams.search.toLowerCase();
      return (
        bookmark.title.toLowerCase().includes(searchTerm) ||
        bookmark.description?.toLowerCase().includes(searchTerm) ||
        bookmark.category?.name.toLowerCase().includes(searchTerm) ||
        bookmark.notes?.toLowerCase().includes(searchTerm) ||
        bookmark.overview?.toLowerCase().includes(searchTerm)
      );
    });

  const sortParam = searchParams.sort || "newest";
  const sortedBookmarks = [...filteredBookmarks].sort((a, b) => {
    switch (sortParam) {
      case "oldest":
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case "az":
        return a.title.localeCompare(b.title);
      case "za":
        return b.title.localeCompare(a.title);
      case "newest":
      default:
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  });

  const topCreations = [...bookmarks]
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 12);

  const featuredBookmarks = bookmarks.filter((b) => b.isFavorite).slice(0, 6);

  const bookmarksByCategory = categories.reduce((acc, category) => {
    const categoryBookmarks = bookmarks.filter(
      (b) => b.category?.id === category.id
    );
    if (categoryBookmarks.length > 0) {
      acc[category.id] = categoryBookmarks;
    }
    return acc;
  }, {} as Record<string, typeof bookmarks>);

  const formattedCategories = categories.map((cat) => ({
    id: cat.id.toString(),
    name: cat.name,
    color: cat.color || undefined,
    icon: cat.icon || undefined,
  }));

  const creationFromBookmark = (bookmark: any) => ({
    id: bookmark.id,
    url: bookmark.url,
    title: bookmark.title,
    description: bookmark.description,
    category: bookmark.category
      ? {
          id: bookmark.category.id.toString(),
          name: bookmark.category.name,
          color: bookmark.category.color || undefined,
          icon: bookmark.category.icon || undefined,
        }
      : undefined,
    user: bookmark.user
      ? {
          id: bookmark.user.id,
          username: bookmark.user.username,
        }
      : null,
    iconUrl: bookmark.iconUrl,
    favicon: bookmark.favicon,
    overview: bookmark.overview,
    ogImage: bookmark.ogImage,
    themeColor: bookmark.themeColor,
    author: bookmark.author,
    isArchived: bookmark.isArchived,
    isFavorite: bookmark.isFavorite,
    slug: bookmark.slug,
    averageRating: bookmark.averageRating,
  });

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <Suspense fallback={<div className="hidden md:block w-64 border-r border-border" />}>
        <AppSidebar
          className="hidden md:flex"
          categories={formattedCategories}
        />
      </Suspense>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto w-full">
        <div className="mx-auto max-w-6xl p-4 md:p-8">
          <MobileMenu categories={formattedCategories} />

          {/* Top Creations Section */}
          {!searchParams.search && !searchParams.category && (
            <div className="mb-10 space-y-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Top Creations
                </h2>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {topCreations.map((bookmark) => (
                  <CreationCard
                    key={bookmark.id}
                    creation={creationFromBookmark(bookmark)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Featured Section */}
          {featuredBookmarks.length > 0 && !searchParams.search && !searchParams.category && (
            <div className="mb-10 space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Featured
                </h2>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {featuredBookmarks.map((bookmark) => (
                  <CreationCard
                    key={bookmark.id}
                    creation={creationFromBookmark(bookmark)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Category Sections */}
          {!searchParams.search && !searchParams.category && categories.length > 0 && (
            <div className="space-y-10">
              {categories.map((category) => {
                const categoryBookmarks = bookmarksByCategory[category.id];
                if (!categoryBookmarks || categoryBookmarks.length === 0) return null;

                return (
                  <div key={category.id} className="space-y-4">
                    <div className="flex items-center gap-2">
                      <FolderKanban className="h-4 w-4 text-primary" />
                      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        {category.name}
                      </h2>
                      <span className="text-xs text-muted-foreground/60">
                        {categoryBookmarks.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                      {categoryBookmarks.map((bookmark) => (
                        <CreationCard
                          key={bookmark.id}
                          creation={creationFromBookmark(bookmark)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Filtered Results */}
          {(searchParams.search || searchParams.category) && (
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {searchParams.search ? "Search Results" : "Category Results"}
                </h2>
                <span className="text-xs text-muted-foreground/60">
                  {sortedBookmarks.length}
                </span>
              </div>

              {sortedBookmarks.length > 0 ? (
                <CreationGrid>
                  {sortedBookmarks.map((bookmark) => (
                    <CreationCard
                      key={bookmark.id}
                      creation={creationFromBookmark(bookmark)}
                    />
                  ))}
                </CreationGrid>
              ) : (
                <div className="flex min-h-[400px] flex-col items-center justify-center rounded-md border border-dashed border-border py-16 text-center">
                  <div className="mx-auto flex max-w-[420px] flex-col items-center justify-center text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                      <Clock className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="mt-6 text-lg font-semibold">No creations found</h3>
                    <p className="mt-2 text-center text-sm text-muted-foreground">
                      {searchParams.search
                        ? `No creations match your search "${searchParams.search}"`
                        : `No creations in this category yet`}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

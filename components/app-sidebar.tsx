"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, TrendingUp, Home } from "lucide-react";
import { useDebouncedCallback } from "use-debounce";
import { useTransition } from "react";
import { cn } from "@/lib/utils";

export interface Category {
  id: string;
  name: string;
  color?: string;
  icon?: string;
}

interface AppSidebarProps {
  categories: Category[];
  className?: string;
}

const SEARCH_DEBOUNCE_MS = 300;

export function SidebarContent({ categories, className, onSelect }: AppSidebarProps & { onSelect?: () => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentCategory = searchParams.get("category");
  const currentSort = searchParams.get("sort") || "newest";
  const [isPending, startTransition] = useTransition();

  const handleCategoryClick = (categoryId: string | null) => {
    const params = new URLSearchParams(searchParams);
    if (categoryId === null || categoryId === currentCategory) {
      params.delete("category");
    } else {
      params.set("category", categoryId);
    }
    startTransition(() => {
      router.push(`/?${params.toString()}`);
      onSelect?.();
    });
  };

  const handleSortChange = (value: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("sort", value);
    startTransition(() => {
      router.push(`/?${params.toString()}`);
    });
  };

  const handleSearch = useDebouncedCallback((term: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (term) {
      params.set("search", term);
    } else {
      params.delete("search");
    }
    startTransition(() => {
      router.push(`/?${params.toString()}`);
    });
  }, SEARCH_DEBOUNCE_MS);

  const isFiltered = searchParams.get("search") || searchParams.get("category");

  return (
    <div className={cn("flex h-full flex-col bg-background", className)}>
      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="text"
              defaultValue={searchParams.get("search") ?? ""}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search..."
              className="h-9 pl-9"
              aria-label="Search creations"
            />
            {isPending && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div
                  className="h-3 w-3 animate-spin rounded-full border-b-2 border-foreground"
                  aria-hidden="true"
                />
              </div>
            )}
          </div>
        </div>

        {/* Sort */}
        <div className="mb-6">
          <label className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
            Sort By
          </label>
          <Select value={currentSort} onValueChange={handleSortChange}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Sort by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
              <SelectItem value="az">A to Z</SelectItem>
              <SelectItem value="za">Z to A</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Navigation */}
        <nav className="space-y-1">
          <Button
            variant={!isFiltered ? "secondary" : "ghost"}
            className="w-full justify-start"
            asChild
            onClick={() => onSelect?.()}
          >
            <Link href="/">
              <TrendingUp className="mr-2 h-4 w-4" />
              Top Creations
            </Link>
          </Button>
        </nav>

        {/* Categories */}
        <div className="mt-6">
          <label className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
            Categories
          </label>
          <nav className="space-y-1">
            {categories.map((category) => (
              <Button
                key={category.id}
                variant={currentCategory === category.id ? "secondary" : "ghost"}
                className="w-full justify-start"
                onClick={() => handleCategoryClick(category.id)}
              >
                {category.name}
              </Button>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}

export function AppSidebar(props: AppSidebarProps) {
  return (
    <aside className={cn("flex h-[calc(100vh-3.5rem)] w-64 flex-col border-r border-border bg-background", props.className)}>
      <SidebarContent {...props} />
    </aside>
  );
}

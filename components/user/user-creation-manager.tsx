"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Loader2, Eye, Trash2, Pencil } from "lucide-react";
import {
  createCreation,
  updateCreation,
  deleteCreation,
  publishCreation,
  type ActionState,
} from "@/lib/actions";
import { toast } from "sonner";

interface Category {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  icon: string | null;
}

interface Creation {
  id: string;
  title: string;
  slug: string;
  url: string;
  description: string | null;
  overview: string | null;
  favicon: string | null;
  ogImage: string | null;
  categoryId: string | null;
  status: "draft" | "published";
  isFavorite: boolean;
  isArchived: boolean;
}

interface CreationWithCategory extends Creation {
  category: Category | null;
}

interface UserCreationManagerProps {
  creations: CreationWithCategory[];
  categories: Category[];
  userId: string;
}

export function UserCreationManager({
  creations,
  categories,
  userId,
}: UserCreationManagerProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const handlePublish = async (id: string) => {
    setIsPublishing(id);
    try {
      const result = await publishCreation(null, { id, userId });
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Bookmark published!");
        router.refresh();
      }
    } catch (error) {
      toast.error("Failed to publish");
    } finally {
      setIsPublishing(null);
    }
  };

  const handleDelete = async (creation: CreationWithCategory) => {
    if (!confirm("Are you sure you want to delete this creation?")) {
      return;
    }

    setIsDeleting(creation.id.toString());
    try {
      const result = await deleteCreation(null, {
        id: creation.id.toString(),
        url: creation.url,
        userId,
      });

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Creation deleted!");
        router.refresh();
      }
    } catch (error) {
      toast.error("Failed to delete");
    } finally {
      setIsDeleting(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">My Creations</h2>
        <Button onClick={() => router.push("/dashboard/new")} size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Add Creation
        </Button>
      </div>

      {creations.length === 0 ? (
        <div className="text-center py-12 border border-dashed rounded-lg">
          <p className="text-muted-foreground mb-4">
            You haven&apos;t created any creations yet
          </p>
          <Button onClick={() => router.push("/dashboard/new")}>
            <Plus className="mr-2 h-4 w-4" />
            Create Your First Creation
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {creations.map((creation) => {
            const isPublished = creation.status === "published";
            const idStr = creation.id.toString();
            return (
              <div
                key={creation.id}
                className="group relative flex flex-col overflow-hidden rounded-md border border-border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
              >
                {/* Left accent bar */}
                <div
                  className={`absolute left-0 top-0 h-full w-1 ${
                    isPublished ? "bg-primary" : "bg-muted-foreground/40"
                  }`}
                />

                <div className="flex flex-1 flex-col space-y-3 p-4 pl-5">
                  {/* Title */}
                  <h3 className="truncate font-medium text-sm text-foreground">
                    {creation.title}
                  </h3>

                  {/* Category + Status row */}
                  <div className="flex flex-wrap items-center gap-2">
                    {creation.category ? (
                      <Badge
                        style={{
                          backgroundColor: creation.category.color || undefined,
                          color: "white",
                        }}
                      >
                        {creation.category.name}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Uncategorized
                      </span>
                    )}
                  </div>

                  {/* Status indicator */}
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        isPublished ? "bg-green-500" : "bg-muted-foreground"
                      }`}
                    />
                    <span
                      className={`text-xs ${
                        isPublished
                          ? "text-green-500"
                          : "text-muted-foreground"
                      }`}
                    >
                      {isPublished ? "Published" : "Draft"}
                    </span>
                  </div>

                  {/* URL truncated in mono */}
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {creation.url}
                  </p>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        router.push(`/dashboard/edit/${creation.id}`)
                      }
                    >
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                      Edit
                    </Button>
                    {!isPublished && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePublish(idStr)}
                        disabled={isPublishing === idStr}
                      >
                        {isPublishing === idStr ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Eye className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Publish
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(creation)}
                      disabled={isDeleting === idStr}
                      className="ml-auto text-red-400 hover:text-red-400"
                    >
                      {isDeleting === idStr ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

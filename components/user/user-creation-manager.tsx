"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Loader2, EyeOff, Eye, Trash2 } from "lucide-react";
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
        <h2 className="text-lg font-semibold">
          My Creations
        </h2>
        <Button
          onClick={() => router.push("/dashboard/new")}
          size="sm"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Creation
        </Button>
      </div>

      {creations.length === 0 ? (
        <div className="text-center py-12 border border-dashed rounded-lg">
          <p className="text-muted-foreground mb-4">
            You haven't created any creations yet
          </p>
          <Button onClick={() => router.push("/dashboard/new")}>
            <Plus className="mr-2 h-4 w-4" />
            Create Your First Creation
          </Button>
        </div>
      ) : (
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {creations.map((creation) => (
                <TableRow key={creation.id}>
                  <TableCell className="font-medium">
                    {creation.title}
                  </TableCell>
                  <TableCell>
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
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={creation.status === "published" ? "default" : "secondary"}
                    >
                      {creation.status === "published" ? (
                        <>
                          <Eye className="mr-1 h-3 w-3" />
                          Published
                        </>
                      ) : (
                        <>
                          <EyeOff className="mr-1 h-3 w-3" />
                          Draft
                        </>
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {creation.status === "draft" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePublish(creation.id.toString())}
                          disabled={isPublishing === creation.id.toString()}
                        >
                          {isPublishing === creation.id.toString() ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Publish"
                          )}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/dashboard/edit/${creation.id}`)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(creation)}
                        disabled={isDeleting === creation.id.toString()}
                      >
                        {isDeleting === creation.id.toString() ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 text-destructive" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

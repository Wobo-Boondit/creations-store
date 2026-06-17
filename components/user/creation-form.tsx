"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createCreation, updateCreation, addScreenshotToCreation, setMainScreenshot, removeScreenshot } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ArrowLeft, Upload, X, Star, Trash2, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import type { Category } from "@/lib/data";
import { cn } from "@/lib/utils";

interface Screenshot {
  id: string;
  url: string;
  isMain: boolean;
  isUploading: boolean;
}

interface Creation {
  id: string;
  title: string;
  slug: string;
  url: string;
  description: string | null;
  iconUrl: string | null;
  ogImage: string | null;
  themeColor: string | null;
  author: string | null;
  screenshotUrl: string | null;
  categoryId: string | null;
  status: "draft" | "published";
}

// Subset of fields an external generator can hand us to prefill the form.
export interface CreationInitialValues {
  title?: string;
  url?: string;
  description?: string;
  themeColor?: string;
  author?: string;
  iconUrl?: string;
  screenshotUrl?: string;
}

interface CreationFormProps {
  categories: Category[];
  userId: string;
  mode: "create" | "edit";
  creation?: Creation;
  username?: string;
  // Create-mode prefill (e.g. from the R1 generator's "Export to Store").
  initialValues?: CreationInitialValues;
}

// Icons must be CDN-hosted to be submitted (createCreation enforces this), so a
// prefilled off-CDN icon can't go straight into the hidden iconUrl field — we
// only accept it if it's already on our CDN.
const CDN_HOST = "cdn.boondit.site";
function isCdnIcon(url?: string): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname === CDN_HOST;
  } catch {
    return false;
  }
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function CreationForm({
  categories,
  userId,
  mode,
  creation,
  username,
  initialValues,
}: CreationFormProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [isUploadingIcon, setIsUploadingIcon] = useState(false);

  // Prefill only applies to create mode (edit always wins from `creation`).
  const init = mode === "create" ? initialValues : undefined;

  // A prefilled icon that ISN'T CDN-hosted can't be submitted directly; surface
  // it as a suggestion so the user can re-upload it through the CDN.
  const [suggestedIcon, setSuggestedIcon] = useState<string | null>(
    init?.iconUrl && !isCdnIcon(init.iconUrl) ? init.iconUrl : null,
  );

  const [formData, setFormData] = useState({
    title: creation?.title || init?.title || "",
    slug: creation?.slug || (init?.title ? slugify(init.title) : ""),
    url: creation?.url || init?.url || "",
    description: creation?.description || init?.description || "",
    iconUrl: creation?.iconUrl || (isCdnIcon(init?.iconUrl) ? init!.iconUrl! : ""),
    ogImage: creation?.ogImage || "",
    themeColor: creation?.themeColor || init?.themeColor || "#fe5000",
    author: creation?.author || username || init?.author || "",
    screenshotUrl: creation?.screenshotUrl || init?.screenshotUrl || "",
    categoryId: creation?.categoryId || "none",
    status: creation?.status || "draft",
  });

  // Load screenshots when editing
  useEffect(() => {
    if (mode === "edit" && creation?.id) {
      loadScreenshots();
    }
  }, [mode, creation]);

  const loadScreenshots = async () => {
    if (!creation?.id) return;

    try {
      const response = await fetch(`/api/creations/${creation.id}/screenshots`);
      if (response.ok) {
        const data = await response.json();
        setScreenshots(data.screenshots || []);
      }
    } catch (error) {
      console.error("Failed to load screenshots:", error);
    }
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const title = e.target.value;
    setFormData((prev) => ({ ...prev, title, slug: slugify(title) }));
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let url = e.target.value.trim();
    if (url && !url.match(/^https?:\/\//)) {
      url = `https://${url}`;
    }
    setFormData((prev) => ({ ...prev, url }));
  };

  const handleFileUpload = async (files: FileList) => {
    const validFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));

    if (validFiles.length === 0) {
      toast.error("Please select image files only");
      return;
    }

    setUploadingCount(validFiles.length);

    for (const file of validFiles) {
      const tempId = crypto.randomUUID();

      // Add placeholder screenshot
      setScreenshots((prev) => [
        ...prev,
        {
          id: tempId,
          url: "",
          isMain: screenshots.length === 0,
          isUploading: true,
        },
      ]);

      try {
        const uploadFormData = new FormData();
        uploadFormData.append("file", file);

        const response = await fetch("/api/screenshots/upload", {
          method: "POST",
          body: uploadFormData,
        });

        if (!response.ok) {
          throw new Error("Failed to upload screenshot");
        }

        const data = await response.json();

        // Update the screenshot with the actual URL
        setScreenshots((prev) =>
          prev.map((s) =>
            s.id === tempId
              ? { ...s, url: data.url, isUploading: false }
              : s
          )
        );

        // Set as main screenshot URL if this is the first one or marked as main
        if (screenshots.length === 0 || screenshots.find(s => s.id === tempId)?.isMain) {
          setFormData((prev) => ({ ...prev, screenshotUrl: data.url }));
        }

        toast.success("Screenshot uploaded successfully!");
      } catch (error) {
        console.error("Upload error:", error);
        toast.error("Failed to upload screenshot");

        // Remove the failed upload
        setScreenshots((prev) => prev.filter((s) => s.id !== tempId));
      } finally {
        setUploadingCount((prev) => Math.max(0, prev - 1));
      }
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleIconUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    setIsUploadingIcon(true);

    try {
      const uploadFormData = new FormData();
      uploadFormData.append("file", file);

      const response = await fetch("/api/screenshots/upload", {
        method: "POST",
        body: uploadFormData,
      });

      if (!response.ok) {
        throw new Error("Failed to upload icon");
      }

      const data = await response.json();

      setFormData((prev) => ({ ...prev, iconUrl: data.url }));
      toast.success("Icon uploaded successfully!");
    } catch (error) {
      console.error("Icon upload error:", error);
      toast.error("Failed to upload icon");
    } finally {
      setIsUploadingIcon(false);
    }
  };

  const handleSetMainScreenshot = async (screenshotId: string) => {
    if (mode === "edit" && creation?.id) {
      await setMainScreenshot(null, {
        screenshotId,
        creationId: creation.id.toString(),
        userId,
      });
    }

    // Update local state
    const screenshot = screenshots.find((s) => s.id === screenshotId);
    if (screenshot) {
      setFormData((prev) => ({ ...prev, screenshotUrl: screenshot.url }));
      setScreenshots((prev) =>
        prev.map((s) => ({
          ...s,
          isMain: s.id === screenshotId,
        }))
      );
    }
  };

  const handleDeleteScreenshot = async (screenshotId: string) => {
    if (mode === "edit" && creation?.id) {
      // If it was the main screenshot, clear the screenshotUrl
      const screenshot = screenshots.find((s) => s.id === screenshotId);
      if (screenshot?.isMain) {
        setFormData((prev) => ({ ...prev, screenshotUrl: "" }));
      }

      await removeScreenshot(null, {
        screenshotId,
        creationId: creation!.id.toString(),
        userId,
      });
    }

    setScreenshots((prev) => prev.filter((s) => s.id !== screenshotId));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      // First, create or update the creation
      const formDataObj = new FormData(e.currentTarget);
      formDataObj.append("userId", userId);

      // Add status for new creations
      if (mode === "create") {
        formDataObj.append("status", formData.status);
      }

      const result = mode === "create"
        ? await createCreation(null, Object.fromEntries(formDataObj) as any)
        : await updateCreation(null, {
            ...(Object.fromEntries(formDataObj) as any),
            id: creation!.id.toString(),
            userId,
          });

      if (result.error) {
        toast.error(result.error);
        setIsSaving(false);
        return;
      }

      toast.success(mode === "create" ? "Creation created!" : "Creation updated!");

      // If editing, add new screenshots
      if (mode === "edit" && creation?.id && screenshots.length > 0) {
        for (const screenshot of screenshots) {
          // Only add screenshots that don't have a numeric ID (new uploads)
          if (!screenshot.id.match(/^\d+$/)) {
            // This is a client-side temp ID, need to add to database
            // But since the ID is temp and URL is now uploaded, we should use the API
            const addResult = await addScreenshotToCreation(null, {
              creationId: creation.id.toString(),
              url: screenshot.url,
              isMain: screenshot.isMain ? "true" : "false",
              userId,
            });

            if (addResult.error) {
              console.error("Failed to add screenshot:", addResult.error);
            }
          }
        }
      }

      router.push("/dashboard");
    } catch (err) {
      console.error("Error saving creation:", err);
      toast.error("Failed to save creation");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <input type="hidden" name="id" value={creation?.id || ""} />
      <input type="hidden" name="slug" value={formData.slug} />
      <input type="hidden" name="screenshotUrl" value={formData.screenshotUrl} />

      {/* Basic Information */}
      <div className="space-y-4 rounded-xl border bg-card p-6">
        <h3 className="text-lg font-semibold">Basic Information</h3>

        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <Label htmlFor="url">URL *</Label>
            <Input
              id="url"
              name="url"
              type="url"
              required
              value={formData.url}
              onChange={handleUrlChange}
              placeholder="https://barkle.chat"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              name="title"
              required
              value={formData.title}
              onChange={handleTitleChange}
              placeholder="Barkle"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              name="description"
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder="Social platform"
            />
          </div>

          {mode === "create" && (
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                name="status"
                value={formData.status}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, status: value as "draft" | "published" }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft - Not visible publicly</SelectItem>
                  <SelectItem value="published">Published - Visible to everyone</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {formData.status === "draft"
                  ? "This creation will only be visible to you"
                  : "This creation will be visible to everyone"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Category & Styling */}
      <div className="space-y-4 rounded-xl border bg-card p-6">
        <h3 className="text-lg font-semibold">Category & Styling</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="categoryId">Category</Label>
            <Select
              name="categoryId"
              value={formData.categoryId}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, categoryId: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Category</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="themeColor">Theme Color</Label>
            <div className="flex items-center gap-2">
              <Input
                id="themeColor"
                name="themeColor"
                type="color"
                value={formData.themeColor}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, themeColor: e.target.value }))
                }
                className="w-20 h-10 cursor-pointer"
              />
              <Input
                type="text"
                value={formData.themeColor}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, themeColor: e.target.value }))
                }
                placeholder="#fe5000"
                className="flex-1"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Media */}
      <div className="space-y-4 rounded-xl border bg-card p-6">
        <h3 className="text-lg font-semibold">Media</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="iconUrl">Icon</Label>
            <input type="hidden" name="iconUrl" value={formData.iconUrl} />
            <div className="flex items-center gap-3">
              {formData.iconUrl ? (
                <img
                  src={formData.iconUrl}
                  alt="Icon preview"
                  className="h-12 w-12 rounded-lg border object-cover"
                />
              ) : (
                <div className="h-12 w-12 rounded-lg border flex items-center justify-center text-muted-foreground">
                  <ImageIcon className="h-5 w-5" />
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isUploadingIcon}
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "image/*";
                  input.onchange = (e) => {
                    const target = e.target as HTMLInputElement;
                    if (target.files && target.files[0]) {
                      handleIconUpload(target.files[0]);
                    }
                  };
                  input.click();
                }}
              >
                {isUploadingIcon ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    {formData.iconUrl ? "Replace" : "Upload"}
                  </>
                )}
              </Button>
              {formData.iconUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setFormData((prev) => ({ ...prev, iconUrl: "" }))}
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Upload from your device. Icons are stored on Boondit CDN.
            </p>
            {suggestedIcon && !formData.iconUrl && (
              <div className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/30 px-3 py-2">
                <img
                  src={suggestedIcon}
                  alt="Suggested icon"
                  className="h-8 w-8 rounded object-cover"
                />
                <p className="flex-1 text-xs text-muted-foreground">
                  Icon from the generator — re-upload it here to host it on the
                  Boondit CDN.
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSuggestedIcon(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="author">Author</Label>
            <Input
              id="author"
              name="author"
              type="text"
              value={formData.author}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, author: e.target.value }))
              }
              placeholder="Your Discord username"
              readOnly={mode === "create" && !!username}
              className={mode === "create" && username ? "bg-muted" : ""}
            />
            {mode === "create" && username && (
              <p className="text-xs text-muted-foreground">
                Auto-filled from your Discord account
              </p>
            )}
          </div>
        </div>

        {/* Screenshot Uploader */}
        <div className="space-y-3">
          <Label>Screenshots</Label>

          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className={cn(
              "relative border-2 border-dashed rounded-lg p-8 text-center transition-colors",
              "hover:border-primary/50"
            )}
          >
            <input
              type="file"
              id="screenshot-upload"
              className="hidden"
              accept="image/*"
              multiple
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFileUpload(e.target.files);
                }
              }}
              disabled={uploadingCount > 0 || isUploadingIcon}
            />
            <label
              htmlFor="screenshot-upload"
              className="flex flex-col items-center justify-center gap-2 cursor-pointer"
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <div className="text-sm">
                <span className="font-medium text-foreground">
                  {uploadingCount > 0 ? `Uploading ${uploadingCount} file${uploadingCount > 1 ? 's' : ''}...` : "Click to upload"}
                </span>
                <span className="text-muted-foreground"> or drag and drop</span>
              </div>
              <p className="text-xs text-muted-foreground">
                PNG, JPG, GIF up to 10MB each
              </p>
            </label>
          </div>

          {/* Screenshot Grid */}
          {screenshots.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {screenshots.map((screenshot, index) => (
                <div
                  key={screenshot.id}
                  className={cn(
                    "relative group aspect-video rounded-lg border-2 overflow-hidden",
                    screenshot.isMain && "border-primary"
                  )}
                >
                  {screenshot.isUploading ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <>
                      <img
                        src={screenshot.url}
                        alt={`Screenshot ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="absolute top-2 right-2 flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => handleSetMainScreenshot(screenshot.id)}
                            disabled={screenshot.isMain}
                            className="h-8 w-8 p-0"
                          >
                            <Star className={cn(
                              "h-4 w-4",
                              screenshot.isMain && "fill-current"
                            )} />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeleteScreenshot(screenshot.id)}
                            className="h-8 w-8 p-0"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        {screenshot.isMain && (
                          <div className="absolute bottom-2 left-2">
                            <span className="text-xs bg-primary text-white px-2 py-1 rounded">
                              Main
                            </span>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/dashboard")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>
        <Button type="submit" disabled={isSaving || uploadingCount > 0 || isUploadingIcon}>
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            mode === "create" ? "Create Creation" : "Save Changes"
          )}
        </Button>
      </div>
    </form>
  );
}

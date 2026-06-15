import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserCreations, getAllCategories } from "@/lib/data";
import { UserCreationManager } from "@/components/user/user-creation-manager";
import { LayoutGrid, FileText, FolderKanban } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user?.id) {
    redirect("/auth/signin");
  }

  const [creations, categories] = await Promise.all([
    getUserCreations(user.id),
    getAllCategories(),
  ]);

  const drafts = creations.filter((b) => b.status === "draft");
  const published = creations.filter((b) => b.status === "published");

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="p-8">
          <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between border-b pb-8">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">
                  My Dashboard
                </h1>
                <p className="text-muted-foreground mt-1">
                  Manage your creations and drafts
                </p>
              </div>
            </div>
            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border bg-card p-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <LayoutGrid className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">
                      {creations.length}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Total Creations
                    </div>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border bg-card p-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FolderKanban className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">
                      {published.length}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Published
                    </div>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border bg-card p-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileText className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">
                      {drafts.length}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Drafts
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Creation Manager */}
            <UserCreationManager
              creations={creations}
              categories={categories}
              userId={user.id}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
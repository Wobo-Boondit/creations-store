import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserCreations, getAllCategories } from "@/lib/data";
import { UserCreationManager } from "@/components/user/user-creation-manager";
import Link from "next/link";
import { Settings } from "lucide-react";

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

  const stats = [
    { label: "Total", value: creations.length, dot: "bg-primary" },
    { label: "Published", value: published.length, dot: "bg-secondary" },
    { label: "Drafts", value: drafts.length, dot: "bg-accent" },
  ];

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="p-8">
          <div className="space-y-8">
            {/* Compact header */}
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold tracking-tight">
                My Dashboard
              </h1>
              <div className="flex items-center gap-4">
                <Link
                  href="/dashboard/settings"
                  className="inline-flex h-8 items-center gap-2 rounded-md border bg-transparent px-3 text-sm font-medium transition-colors hover:bg-card"
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
                <div className="flex items-center gap-2.5">
                  {user.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.avatar}
                      alt={user.name}
                      className="h-8 w-8 rounded-full border object-cover"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border bg-muted text-xs font-bold">
                      {user.name?.[0]?.toUpperCase() || "?"}
                    </div>
                  )}
                  <span className="hidden text-sm font-medium sm:inline">
                    {user.username || user.name}
                  </span>
                </div>
              </div>
            </div>

            {/* Stat pills */}
            <div className="flex flex-wrap gap-3">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="flex items-center gap-2.5 rounded-full border bg-card px-4 py-2"
                >
                  <span className={`h-2 w-2 rounded-full ${stat.dot}`} />
                  <span className="text-sm font-semibold">{stat.value}</span>
                  <span className="text-sm text-muted-foreground">
                    {stat.label}
                  </span>
                </div>
              ))}
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

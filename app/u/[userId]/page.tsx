import { getUserProfile } from "@/lib/data";
import { notFound } from "next/navigation";
import { CreationCard } from "@/components/creation-card";
import { CreationGrid } from "@/components/creation-grid";
import { User, Calendar, Layers } from "lucide-react";

type Props = {
  params: { userId: string };
};

export default async function UserProfilePage({ params }: Props) {
  const profile = await getUserProfile(params.userId);

  if (!profile) {
    notFound();
  }

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="p-8">
          <div className="mx-auto max-w-7xl space-y-8">
            {/* Profile Header */}
            <div className="rounded-xl border bg-card p-6 sm:p-8">
              <div className="flex items-start gap-6">
                {profile.avatarUrl ? (
                  <img
                    src={profile.avatarUrl}
                    alt={profile.username}
                    className="h-20 w-20 rounded-full object-cover border-2"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted border-2">
                    <User className="h-10 w-10 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 space-y-3">
                  <div>
                    <h1 className="text-3xl font-bold">
                      {profile.username}
                    </h1>
                    {profile.username && (
                      <p className="text-sm text-muted-foreground mt-1">
                        @{profile.username}
                      </p>
                    )}

                  </div>
                  <div className="flex items-center gap-6 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4" />
                      <span>{profile.creationCount} creations</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      <span>
                        Joined {new Date(profile.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* User's Creations */}
            <div>
              <h2 className="text-2xl font-bold mb-4">
                Published Creations
              </h2>
              {profile.creations.length === 0 ? (
                <div className="text-center py-12 rounded-xl border bg-card">
                  <Layers className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    No published creations yet
                  </p>
                </div>
              ) : (
                <CreationGrid>
                  {profile.creations.map((creation: any) => (
                    <CreationCard
                      key={creation.id}
                      creation={{
                        id: creation.id,
                        url: creation.url,
                        title: creation.title,
                        description: creation.description,
                        category: creation.category,
                        favicon: creation.favicon,
                        overview: creation.overview,
                        ogImage: creation.ogImage,
                        isArchived: creation.isArchived,
                        isFavorite: creation.isFavorite,
                        slug: creation.slug,
                        iconUrl: creation.iconUrl,
                        themeColor: creation.themeColor,
                        author: creation.author,
                        screenshotUrl: creation.screenshotUrl,
                      }}
                    />
                  ))}
                </CreationGrid>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
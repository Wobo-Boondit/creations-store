import { notFound, redirect } from "next/navigation";
import { getCreationById } from "@/lib/data";
import {
  getCreationAnalytics,
  getCreationDailyStats,
} from "@/lib/analytics";
import { getCurrentUser } from "@/lib/auth";
import { StarRating } from "@/components/star-rating";
import Link from "next/link";
import {
  Download,
  Eye,
  Users,
  TrendingUp,
  ArrowLeft,
  Star,
} from "lucide-react";
import { directory } from "@/directory.config";
import { InstallChart } from "@/components/install-chart";

interface AnalyticsPageProps {
  params: Promise<{ creationId: string }>;
}

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({ params }: AnalyticsPageProps) {
  const { creationId } = await params;
  const id = creationId;

  const user = await getCurrentUser();
  const creation = await getCreationById(id);

  if (!creation) notFound();

  if (!user || user.id !== creation.userId) {
    redirect(`/${id}`);
  }

  const [analytics, dailyStats] = await Promise.all([
    getCreationAnalytics(id),
    getCreationDailyStats(id, 30),
  ]);

  // Build simple sparkline data (last 14 days of installs)
  const sparkData = dailyStats
    .slice(0, 14)
    .reverse()
    .map((s) => s.installs);
  const maxSpark = Math.max(...sparkData, 1);
  const totalRatingCount = creation.averageRating?.count || 0;
  const avgRating = creation.averageRating?.average || 0;

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl p-6 md:p-8 space-y-8">
          {/* Back link */}
          <Link
            href={`/${id}`}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to {creation.title}
          </Link>

          {/* Creation header */}
          <div className="flex items-center gap-4">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-2xl border"
              style={{ backgroundColor: creation.themeColor || "hsl(var(--muted))" }}
            >
              {creation.iconUrl || creation.favicon ? (
                <img
                  src={creation.iconUrl || creation.favicon || ""}
                  alt={creation.title}
                  className="h-12 w-12 rounded-xl object-contain"
                />
              ) : (
                <span
                  className="text-2xl font-bold"
                  style={{ color: creation.themeColor ? "#fff" : "hsl(var(--muted-foreground))" }}
                >
                  {creation.title[0]?.toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold">{creation.title}</h1>
              {creation.author && (
                <p className="text-sm text-muted-foreground">by {creation.author}</p>
              )}
            </div>
          </div>

          {/* Big stats row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <BigStat
              icon={<Download className="h-5 w-5" />}
              label="Installs"
              value={analytics.totalInstalls}
              accent="primary"
            />
            <BigStat
              icon={<Eye className="h-5 w-5" />}
              label="Views"
              value={analytics.totalClicks}
              accent="blue"
            />
            <BigStat
              icon={<Users className="h-5 w-5" />}
              label="Active (7d)"
              value={analytics.activeUsers7Day}
              accent="green"
            />
            <BigStat
              icon={<TrendingUp className="h-5 w-5" />}
              label="Install Rate"
              value={`${analytics.installRate}%`}
              accent="purple"
            />
          </div>

          {/* Install trend */}
          <div className="rounded-xl border bg-card p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-4">
              Installs (last 14 days)
            </h2>
            {sparkData.every((v) => v === 0) ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No installs yet. Share your creation to get started.
              </p>
            ) : (
              <InstallChart data={sparkData} />
            )}
          </div>

          {/* Rating summary */}
          {totalRatingCount > 0 && (
            <div className="rounded-xl border bg-card p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-4">
                Rating
              </h2>
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-4xl font-bold">{avgRating.toFixed(1)}</p>
                  <StarRating rating={avgRating} count={totalRatingCount} size="sm" />
                </div>
                <div className="flex-1 space-y-1.5">
                  {[5, 4, 3, 2, 1].map((star) => {
                    const pct = totalRatingCount > 0 ? (Math.round(avgRating) === star ? 100 : 0) : 0;
                    return (
                      <div key={star} className="flex items-center gap-2 text-xs">
                        <span className="w-3 text-muted-foreground">{star}</span>
                        <Star className="h-3 w-3 text-muted-foreground fill-muted-foreground" />
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Proxy info */}
          {creation.proxyCode && (
            <div className="rounded-xl border bg-muted/30 p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Install Link
              </h2>
              <div className="flex items-center gap-2">
                <code className="px-3 py-1 bg-background rounded-lg text-sm border">
                  {directory.baseUrl}/go/{creation.proxyCode}
                </code>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Share this link or QR code. Each scan counts as an install.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface BigStatProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  accent: "primary" | "blue" | "green" | "purple";
}

function BigStat({ icon, label, value, accent }: BigStatProps) {
  const accents = {
    primary: "text-primary",
    blue: "text-blue-500",
    green: "text-green-500",
    purple: "text-purple-500",
  };

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className={`flex items-center gap-2 mb-2 ${accents[accent]}`}>
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-bold">{typeof value === "number" ? value.toLocaleString() : value}</p>
    </div>
  );
}

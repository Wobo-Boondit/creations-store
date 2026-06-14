import { notFound, redirect } from "next/navigation";
import { getCreationById, getUserById } from "@/lib/data";
import {
  getCreationAnalytics,
  getCreationDailyStats,
  getTopReferrers,
  getDeviceBreakdown,
} from "@/lib/analytics";
import { getCurrentUser } from "@/lib/auth";
import { Section, Container } from "@/components/craft";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  MousePointerClick,
  Users,
  Download,
  TrendingUp,
  ArrowLeft,
  Calendar,
  Monitor,
  Globe,
} from "lucide-react";

interface AnalyticsPageProps {
  params: Promise<{ creationId: string }>;
}

export default async function AnalyticsPage({ params }: AnalyticsPageProps) {
  const { creationId } = await params;
  const id = creationId;

  // Get current user
  const user = await getCurrentUser();

  // Get creation
  const creation = await getCreationById(id);

  if (!creation) {
    notFound();
  }

  // Check if user is the owner
  if (!user || user.id !== creation.userId) {
    redirect(`/creation/${id}`);
  }

  // Get analytics data
  const analytics = await getCreationAnalytics(id);
  const dailyStats = await getCreationDailyStats(id, 30);
  const topReferrers = await getTopReferrers(id, 10);
  const deviceBreakdown = await getDeviceBreakdown(id);

  return (
    <Section>
      <Container>
        <div className="mx-auto max-w-6xl space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <Button variant="ghost" size="sm" className="gap-2 mb-4" asChild>
                <Link href={`/creation/${id}`}>
                  <ArrowLeft className="h-4 w-4" />
                  Back to Creation
                </Link>
              </Button>
              <h1 className="text-3xl font-bold tracking-tight">
                Analytics for {creation.title}
              </h1>
              <p className="text-muted-foreground">
                Track how users discover and install your creation
              </p>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard
              title="Total Clicks"
              value={analytics.totalClicks.toLocaleString()}
              icon={<MousePointerClick className="h-5 w-5" />}
              subtitle={`${analytics.uniqueClicks.toLocaleString()} unique visitors`}
              color="blue"
            />
            <StatsCard
              title="Total Installs"
              value={analytics.totalInstalls.toLocaleString()}
              icon={<Download className="h-5 w-5" />}
              subtitle={`${analytics.installRate}% install rate`}
              color="green"
            />
            <StatsCard
              title="7-Day Retention"
              value={`${analytics.retention7Day}%`}
              icon={<TrendingUp className="h-5 w-5" />}
              subtitle={`${analytics.activeUsers7Day} active users`}
              color="purple"
            />
            <StatsCard
              title="Avg Daily Clicks"
              value={analytics.avgDailyClicks.toFixed(1)}
              icon={<Calendar className="h-5 w-5" />}
              subtitle={`${analytics.avgDailyInstalls.toFixed(1)} installs/day`}
              color="orange"
            />
          </div>

          {/* 30-Day Stats */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Daily Trend */}
            <div className="bg-card rounded-2xl border-2 border-border p-6">
              <h2 className="text-xl font-semibold mb-4">30-Day Trend</h2>
              <div className="space-y-2">
                {dailyStats.slice(0, 10).map((stat) => (
                  <div key={stat.date} className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{stat.date}</span>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1">
                        <MousePointerClick className="h-3 w-3 text-blue-500" />
                        <span className="text-sm font-medium">{stat.clicks}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Download className="h-3 w-3 text-green-500" />
                        <span className="text-sm font-medium">{stat.installs}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Device Breakdown */}
            <div className="bg-card rounded-2xl border-2 border-border p-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Monitor className="h-5 w-5" />
                Device Breakdown
              </h2>
              <div className="space-y-3">
                {deviceBreakdown.slice(0, 6).map((device) => (
                  <div key={device.device} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{device.device}</span>
                      <span className="text-muted-foreground">
                        {device.clicks} clicks ({device.percentage.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${device.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top Referrers */}
          <div className="bg-card rounded-2xl border-2 border-border p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Top Referrers
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {topReferrers.slice(0, 9).map((referrer) => (
                <div
                  key={referrer.referrer}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <span className="text-sm font-medium truncate" title={referrer.referrer}>
                    {referrer.referrer === "Direct"
                      ? "Direct Traffic"
                      : referrer.referrer.replace(/^https?:\/\//, "").split("/")[0]}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {referrer.clicks} ({referrer.percentage.toFixed(1)}%)
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Proxy URL Info */}
          <div className="bg-muted/50 rounded-2xl border-2 border-border p-6">
            <h2 className="text-xl font-semibold mb-2">Proxy URL Tracking</h2>
            <p className="text-muted-foreground mb-4">
              Your QR codes use a proxy URL to track installs. This allows you to see
              detailed analytics while also enabling better moderation.
            </p>
            {creation.proxyCode && (
              <div className="flex items-center gap-2">
                <code className="px-3 py-1 bg-background rounded-lg text-sm">
                  /go/{creation.proxyCode}
                </code>
                <span className="text-sm text-muted-foreground">
                  → {creation.url}
                </span>
              </div>
            )}
          </div>
        </div>
      </Container>
    </Section>
  );
}

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ReactNode;
  color: "blue" | "green" | "purple" | "orange";
}

function StatsCard({ title, value, subtitle, icon, color }: StatsCardProps) {
  const colorClasses = {
    blue: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    green: "bg-green-500/10 text-green-500 border-green-500/20",
    purple: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    orange: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  };

  return (
    <div className="bg-card rounded-2xl border-2 border-border p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-lg border ${colorClasses[color]}`}>
          {icon}
        </div>
        <h3 className="font-medium text-muted-foreground">{title}</h3>
      </div>
      <p className="text-3xl font-bold mb-1">{value}</p>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

// Next Imports
import { notFound } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import Balancer from "react-wrap-balancer";

export const dynamic = "force-dynamic";

// Database Imports
import { getCreationBySlug, getCreationById, incrementCreationViews, getCreationReviews } from "@/lib/data";
import { recordDetailClick } from "@/lib/analytics";

// Component Imports
import { Section, Container } from "@/components/craft";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreationActions } from "@/components/creation-actions";
import { CreationReviews } from "@/components/creation-reviews";
import { ExternalLink, Calendar, AppWindow, User, Eye, Star } from "lucide-react";
import { StarRating } from "@/components/star-rating";
import { VerifiedBadge } from "@/components/verified-badge";

// Metadata
import { Metadata, ResolvingMetadata } from "next";
import Markdown from "react-markdown";
import { getCurrentUser } from "@/lib/auth";
import { directory } from "@/directory.config";

// UUID regex to extract ID from "{uuid}-{slug}" format
const UUID_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

async function resolveCreation(slugPath: string) {
  // Try UUID prefix first (card links are /{uuid}-{slug})
  const uuidMatch = slugPath.match(UUID_RE);
  if (uuidMatch) {
    const byId = await getCreationById(uuidMatch[1]);
    if (byId) return byId;
  }
  // Fall back to direct slug lookup
  return getCreationBySlug(slugPath);
}

type Props = {
  params: Promise<{ slug: string[] }>;
};

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { slug: slugArr } = await params;
  const slug = slugArr.join('/');

  const bookmark = await resolveCreation(slug);

  if (!bookmark) {
    return {
      title: "Not Found",
    };
  }

  const previousImages = (await parent).openGraph?.images || [];

  const detailUrl = `${directory.baseUrl}/${bookmark.id}-${bookmark.slug}`;
  const bestImage = bookmark.ogImage || bookmark.iconUrl || bookmark.screenshotUrl || bookmark.favicon;

  return {
    title: `${bookmark.title} | ${directory.name}`,
    description:
      bookmark.description ||
      bookmark.overview ||
      `Discover ${bookmark.title} on ${directory.name}`,
    openGraph: {
      title: bookmark.title,
      description: bookmark.description || bookmark.overview || `Discover ${bookmark.title} on ${directory.name}`,
      url: detailUrl,
      siteName: directory.name,
      type: "article",
      images: bestImage
        ? [{ url: bestImage, width: 1200, height: 630, alt: bookmark.title }]
        : previousImages,
    },
    twitter: {
      card: "summary_large_image",
      title: bookmark.title,
      description: bookmark.description || bookmark.overview || undefined,
      images: bestImage ? [bestImage] : [],
    },
  };
}

export default async function Page({ params }: Props) {
  const { slug: slugArr } = await params;
  const slug = slugArr.join('/');

  const bookmark = await resolveCreation(slug);

  if (!bookmark) {
    notFound();
  }

  // Fetch reviews
  const reviews = await getCreationReviews(bookmark.id);

  // Get current user
  const user = await getCurrentUser();

  // Get headers for IP tracking and URL generation
  const headersList = await headers();

  // Get a consistent session identifier for view tracking.
  // Use the *viewer's* id if logged in, otherwise an anonymized IP hash.
  // (Previously this keyed off bookmark.user — the creation's author — which
  // meant every logged-in visitor shared one session key per creation.)
  let viewSessionId: string;
  if (user?.id) {
    viewSessionId = `user_${user.id}`;
  } else {
    // Get IP address from headers for anonymous users
    const forwarded = headersList.get('x-forwarded-for');
    const realIp = headersList.get('x-real-ip');
    const ip = forwarded ? forwarded.split(',')[0].trim() : realIp || 'localhost';

    // Anonymize IP — keep /24 subnet for dedup, drop host portion (privacy)
    const normalizedIp = (ip === '::1' || ip === '127.0.0.1' || ip === 'localhost')
      ? 'local_dev'
      : ip.replace(/(\d+)\.(\d+)\.(\d+)\.(\d+)/, '$1.$2.$3.0');

    viewSessionId = `anon_${normalizedIp}`;
  }

  // Increment views in the background with rate limiting
  incrementCreationViews(bookmark.id, viewSessionId).catch(console.error);

  // Record a click event for analytics (so clicks are tracked on detail page visits too)
  const clickReferrer = headersList.get('referer') || null;
  const clickUserAgent = headersList.get('user-agent') || undefined;
  recordDetailClick(bookmark.id, viewSessionId, clickUserAgent, clickReferrer).catch(console.error);

  // Get the full URL for sharing
  const host = headersList.get('host') || '';
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  const pageUrl = `${protocol}://${host}/${slug}`;

  return (
    <Section>
      <Container>
        <div className="mx-auto max-w-5xl space-y-8">
          {/* Back Navigation */}
          <div>
            <Button variant="ghost" size="sm" className="gap-2" asChild>
              <Link href="/">
                <ExternalLink className="h-4 w-4 rotate-180" />
                Back to Creations
              </Link>
            </Button>
          </div>

          {/* App Store Style Header */}
          <div className="space-y-6">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
              {/* App Icon */}
              <div className="flex-shrink-0">
                <div
                  className="group relative flex h-32 w-32 items-center justify-center rounded-3xl border-4 border-background shadow-xl transition-transform group-hover:scale-105"
                  style={{ backgroundColor: bookmark.themeColor || "hsl(var(--muted))" }}
                >
                  {bookmark.iconUrl || bookmark.favicon || bookmark.ogImage ? (
                    <img
                      src={bookmark.iconUrl || bookmark.favicon || bookmark.ogImage!}
                      alt={`${bookmark.title} icon`}
                      width={128}
                      height={128}
                      className="h-24 w-24 rounded-2xl object-contain"
                    />
                  ) : (
                    <span
                      className="text-5xl font-bold"
                      style={{ color: bookmark.themeColor ? "#fff" : "hsl(var(--muted-foreground))" }}
                    >
                      {bookmark.title[0]?.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>

              {/* App Info */}
              <div className="flex flex-1 flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
                    <Balancer>{bookmark.title}</Balancer>
                  </h1>
                  {bookmark.description && (
                    <p className="text-lg text-muted-foreground">
                      <Balancer>{bookmark.description}</Balancer>
                    </p>
                  )}
                  {/* Creator */}
                  {bookmark.user && (
                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <Link
                        href={`/u/${bookmark.user.id}`}
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {bookmark.user.username}
                        {bookmark.user.isVerified && <VerifiedBadge className="text-[1em]" />}
                      </Link>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <CreationActions
                  title={bookmark.title}
                  url={bookmark.url}
                  description={bookmark.description}
                  iconUrl={bookmark.iconUrl}
                  themeColor={bookmark.themeColor}
                  author={bookmark.author}
                  pageUrl={pageUrl}
                  proxyCode={bookmark.proxyCode}
                  creationId={bookmark.id}
                  isOwner={user?.id === bookmark.userId}
                />
              </div>
            </div>

            {/* App Stats/Info */}
            <div className="flex flex-wrap gap-4 border-t pt-6">
              {bookmark.category && (
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="border-2 bg-background px-3 py-1 text-sm font-medium"
                  >
                    {bookmark.category.name}
                  </Badge>
                </div>
              )}
              {bookmark.averageRating && bookmark.averageRating.count > 0 && (
                <div className="flex items-center gap-2">
                  <StarRating rating={bookmark.averageRating.average} count={bookmark.averageRating.count} size="sm" />
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Eye className="h-4 w-4" />
                <span>{bookmark.views || 0} views</span>
              </div>
              {bookmark.createdAt && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>
                    Added{" "}
                    <time dateTime={new Date(bookmark.createdAt).toISOString()}>
                      {new Date(bookmark.createdAt).toLocaleDateString()}
                    </time>
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Screenshot/Media Gallery */}
          {(bookmark.screenshots && bookmark.screenshots.length > 0) || bookmark.screenshotUrl ? (
            <div className="space-y-4">
              <h2 className="text-2xl font-bold tracking-tight">Screenshots</h2>
              {bookmark.screenshots && bookmark.screenshots.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {bookmark.screenshots.map((screenshot) => (
                    <div key={screenshot.id} className="overflow-hidden rounded-2xl border-2 border-border bg-muted/50">
                      <img
                        src={screenshot.url}
                        alt="Screenshot"
                        className="w-full object-cover hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                  ))}
                </div>
              ) : bookmark.screenshotUrl ? (
                <div className="overflow-hidden rounded-2xl border-2 border-border bg-muted/50">
                  <img
                    src={bookmark.screenshotUrl}
                    alt="Screenshot"
                    className="w-full object-cover"
                  />
                </div>
              ) : null}
            </div>
          ) : bookmark.ogImage ? (
            <div className="space-y-4">
              <h2 className="text-2xl font-bold tracking-tight">Preview</h2>
              <div className="overflow-hidden rounded-2xl border-2 border-border bg-muted/50">
                <img
                  src={bookmark.ogImage}
                  alt="Preview"
                  className="w-full object-cover"
                />
              </div>
            </div>
          ) : null}

          {/* Description Section */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold tracking-tight">About</h2>
            {bookmark.overview ? (
              <div className="prose prose-gray max-w-none dark:prose-invert">
                <Markdown
                  components={{
                    p: ({ children }) => (
                      <p className="my-4 leading-relaxed text-muted-foreground">
                        {children}
                      </p>
                    ),
                    a: ({ children, href }) => (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-primary underline underline-offset-4"
                      >
                        {children}
                      </a>
                    ),
                    h2: ({ children }) => (
                      <h2 className="mt-8 text-xl font-semibold text-foreground">
                        {children}
                      </h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="mt-6 text-lg font-semibold text-foreground">
                        {children}
                      </h3>
                    ),
                    ul: ({ children }) => (
                      <ul className="my-4 ml-6 list-disc text-muted-foreground">
                        {children}
                      </ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="my-4 ml-6 list-decimal text-muted-foreground">
                        {children}
                      </ol>
                    ),
                  }}
                >
                  {bookmark.overview}
                </Markdown>
              </div>
            ) : bookmark.description ? (
              <p className="text-lg text-muted-foreground leading-relaxed">
                {bookmark.description}
              </p>
            ) : (
              <p className="text-muted-foreground">
                No description available for this creation.
              </p>
            )}
          </div>

          {/* More from creator section */}
          {bookmark.user && (
            <div className="border-t pt-8">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">More from {bookmark.user.username}</h3>
                  <Link
                    href={`/u/${bookmark.user.id}`}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    View all creations →
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Reviews Section */}
          <div className="border-t pt-8">
            <CreationReviews
              creationId={bookmark.id}
              initialReviews={reviews}
              initialAverageRating={bookmark.averageRating}
              currentUser={user ? {
                id: user.id,
                username: user.username || user.name || "User",
                avatarUrl: user.avatar || null,
                isVerified: user.isVerified,
              } : null}
            />
          </div>
        </div>
      </Container>
    </Section>
  );
}
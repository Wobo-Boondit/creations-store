import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { AlertTriangle, Home, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WarningPageProps {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ reason?: string }>;
}

export default async function WarningPage({
  params,
  searchParams,
}: WarningPageProps) {
  const { code } = await params;
  const { reason } = await searchParams;
  const supabase = createAdminClient();

  // Find creation by proxy code
  const { data: result, error } = await supabase
    .from("store_creations")
    .select("*")
    .eq("proxy_code", code)
    .limit(1);

  if (!result || result.length === 0 || error) {
    redirect("/?error=invalid-link");
  }

  const creation = result[0];

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full">
        <div className="bg-card rounded-2xl shadow-xl p-8 border border-orange-200 dark:border-orange-900">
          {/* Warning Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-orange-600 dark:text-orange-400" />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-center mb-2 text-foreground">
            Proceed with Caution
          </h1>

          {/* Subtitle */}
          <p className="text-center text-muted-foreground mb-6">
            This creation has been flagged for review
          </p>

          {/* Creation Info */}
          <div className="bg-muted rounded-lg p-4 mb-6">
            <p className="text-sm font-medium text-foreground mb-1">
              {creation.title}
            </p>
            {reason && (
              <p className="text-sm text-orange-600 dark:text-orange-400">
                Reason: {reason}
              </p>
            )}
          </div>

          {/* Warning Message */}
          <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-900 rounded-lg p-4 mb-6">
            <p className="text-sm text-muted-foreground">
              This link has been flagged by our moderation team. You can still
              proceed, but we recommend exercising caution. The destination may
              contain content that violates our community guidelines.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="outline"
              className="flex-1"
              asChild
            >
              <a href="/">
                <Home className="w-4 h-4 mr-2" />
                Go Home
              </a>
            </Button>
            <Button
              className="flex-1 bg-orange-600 hover:bg-orange-700"
              asChild
            >
              <a href={creation.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 mr-2" />
                Proceed Anyway
              </a>
            </Button>
          </div>

          {/* Footer Note */}
          <p className="text-xs text-center text-muted-foreground mt-6">
            By proceeding, you acknowledge that you understand the risks.
          </p>
        </div>
      </div>
    </div>
  );
}

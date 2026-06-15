import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AccountSettings } from "@/components/user/account-settings";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();

  if (!user?.id) {
    redirect("/auth/signin");
  }

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl p-8">
          <Link
            href="/dashboard"
            className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>

          <h1 className="text-3xl font-bold tracking-tight mb-1">
            Account Settings
          </h1>
          <p className="text-muted-foreground mb-8">
            Manage your unified Boondit account
          </p>

          <AccountSettings user={user} />
        </div>
      </div>
    </div>
  );
}

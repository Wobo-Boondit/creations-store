import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getAllCategories } from "@/lib/data";
import { CreationForm } from "@/components/user/creation-form";

// Fields an external generator (boondit.site/r1-generator) can prefill. Kept in
// sync with CreationForm's initialValues. The icon is intentionally NOT
// prefilled into the submitted hidden field — createCreation requires icons to
// be CDN-hosted — but we pass it through as a preview the user can re-upload.
type Prefill = {
  title?: string;
  url?: string;
  description?: string;
  themeColor?: string;
  author?: string;
  iconUrl?: string;
  screenshotUrl?: string;
};

function decodePrefill(raw?: string): Prefill | undefined {
  if (!raw) return undefined;
  try {
    // base64url-encoded JSON (URL-safe so it survives the OAuth round-trip)
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object") {
      // Only keep known string fields — never trust arbitrary keys.
      const pick = (v: unknown) => (typeof v === "string" ? v : undefined);
      return {
        title: pick(parsed.title),
        url: pick(parsed.url),
        description: pick(parsed.description),
        themeColor: pick(parsed.themeColor),
        author: pick(parsed.author),
        iconUrl: pick(parsed.iconUrl),
        screenshotUrl: pick(parsed.screenshotUrl),
      };
    }
  } catch {
    /* malformed prefill — ignore and render an empty form */
  }
  return undefined;
}

export default async function NewCreationPage({
  searchParams,
}: {
  searchParams: Promise<{ prefill?: string }>;
}) {
  const user = await getCurrentUser();
  const { prefill: prefillRaw } = await searchParams;

  if (!user?.id) {
    // Preserve the full intent (including the prefill payload) through login.
    const target = prefillRaw
      ? `/dashboard/new?prefill=${encodeURIComponent(prefillRaw)}`
      : "/dashboard/new";
    redirect(`/auth/signin?redirect=${encodeURIComponent(target)}`);
  }

  const categories = await getAllCategories();
  const prefill = decodePrefill(prefillRaw);

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="p-8">
          <div className="mx-auto max-w-3xl">
            <div className="mb-8">
              <h1 className="text-3xl font-bold tracking-tight">
                Create Creation
              </h1>
              <p className="text-muted-foreground mt-2">
                {prefill
                  ? "We prefilled this from the R1 generator — review and publish."
                  : "Add a new creation to your collection"}
              </p>
            </div>

            <CreationForm
              categories={categories}
              userId={user.id}
              mode="create"
              username={user.name}
              initialValues={prefill}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

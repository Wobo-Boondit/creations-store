import { getCurrentUser } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getAllCategories, getCreationById } from "@/lib/data";
import { CreationForm } from "@/components/user/creation-form";
import { Button } from "@/components/ui/button";
import { BarChart3 } from "lucide-react";
import Link from "next/link";

type Props = {
  params: { id: string };
};

export default async function EditCreationPage({ params }: Props) {
  const user = await getCurrentUser();

  if (!user?.id) {
    redirect("/auth/signin");
  }

  const creation = await getCreationById(params.id as string);

  if (!creation) {
    notFound();
  }

  // Check ownership
  if (creation.userId !== user.id) {
    redirect("/dashboard");
  }

  const categories = await getAllCategories();

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="p-8">
          <div className="mx-auto max-w-3xl">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">
                  Edit Creation
                </h1>
                <p className="text-muted-foreground mt-2">
                  Update your creation details
                </p>
              </div>
              <Button variant="outline" asChild>
                <Link href={`/analytics/${params.id}`}>
                  <BarChart3 className="h-4 w-4 mr-2" />
                  View Analytics
                </Link>
              </Button>
            </div>

            <CreationForm
              categories={categories}
              userId={user.id}
              mode="edit"
              creation={creation}
              username={user.name}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

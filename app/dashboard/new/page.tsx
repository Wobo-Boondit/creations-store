import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getAllCategories } from "@/lib/data";
import { CreationForm } from "@/components/user/creation-form";

export default async function NewCreationPage() {
  const user = await getCurrentUser();

  if (!user?.id) {
    redirect("/auth/signin");
  }

  const categories = await getAllCategories();

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
                Add a new creation to your collection
              </p>
            </div>

            <CreationForm
              categories={categories}
              userId={user.id}
              mode="create"
              username={user.name}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

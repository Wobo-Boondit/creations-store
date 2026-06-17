"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AdminHeader() {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      const response = await fetch("/api/admin/logout", {
        method: "POST",
        redirect: "manual",
      });

      if (response.type === "opaqueredirect" || response.status === 0 || response.ok) {
        router.push("/auth/signout");
        router.refresh();
      }
    } catch (error) {
      console.error("Logout error:", error);
      router.push("/auth/signout");
    }
  };

  return (
    <header className="bg-white shadow-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-4">
          <nav className="flex space-x-4">
            <Link
              href="/admin"
              className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              Add Creation
            </Link>
            <Link
              href="/admin/manage"
              className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              Manage Creations
            </Link>
            <Link
              href="/admin/users"
              className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              Manage Users
            </Link>
          </nav>
          <button
            onClick={handleLogout}
            className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}

"use client";

import { useState } from "react";
import AdminHeader from "@/components/admin/admin-header";

export default function AdminPage() {
  const [formData, setFormData] = useState({
    url: "",
    title: "",
    slug: "",
    description: "",
    categoryId: "",
    overview: "",
    iconUrl: "",
    themeColor: "#fe5000",
    author: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch("/api/creations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error("Failed to add creation");
      }

      // Clear form after successful submission
      setFormData({
        url: "",
        title: "",
        slug: "",
        description: "",
        categoryId: "",
        overview: "",
        iconUrl: "",
        themeColor: "#fe5000",
        author: "",
      });

      alert("Creation added successfully!");
    } catch (error) {
      console.error("Error adding creation:", error);
      alert("Failed to add creation. Please try again.");
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <>
      <AdminHeader />
      <div className="mx-auto max-w-4xl p-6">
        <h1 className="mb-6 text-3xl font-bold">Add New Creation</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="url" className="mb-1 block text-sm font-medium">
              URL *
            </label>
            <input
              type="url"
              id="url"
              name="url"
              required
              value={formData.url}
              onChange={handleChange}
              className="w-full rounded-md border p-2"
            />
          </div>

          <div>
            <label htmlFor="title" className="mb-1 block text-sm font-medium">
              Title *
            </label>
            <input
              type="text"
              id="title"
              name="title"
              required
              value={formData.title}
              onChange={handleChange}
              className="w-full rounded-md border p-2"
            />
          </div>

          <div>
            <label htmlFor="slug" className="mb-1 block text-sm font-medium">
              Slug
            </label>
            <input
              type="text"
              id="slug"
              name="slug"
              value={formData.slug}
              onChange={handleChange}
              className="w-full rounded-md border p-2"
              placeholder="Auto-generated from title if empty"
            />
          </div>

          <div>
            <label
              htmlFor="description"
              className="mb-1 block text-sm font-medium"
            >
              Description
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              className="w-full rounded-md border p-2"
              rows={3}
            />
          </div>

          <div>
            <label
              htmlFor="categoryId"
              className="mb-1 block text-sm font-medium"
            >
              Category ID
            </label>
            <input
              type="text"
              id="categoryId"
              name="categoryId"
              value={formData.categoryId}
              onChange={handleChange}
              className="w-full rounded-md border p-2"
              placeholder="e.g., ai-tools, productivity"
            />
          </div>

          <div>
            <label
              htmlFor="overview"
              className="mb-1 block text-sm font-medium"
            >
              Overview
            </label>
            <textarea
              id="overview"
              name="overview"
              value={formData.overview}
              onChange={handleChange}
              className="w-full rounded-md border p-2"
              rows={3}
            />
          </div>

          <div>
            <label
              htmlFor="iconUrl"
              className="mb-1 block text-sm font-medium"
            >
              Icon
            </label>
            <input type="hidden" id="iconUrl" name="iconUrl" value={formData.iconUrl} />
            <div className="flex items-center gap-3">
              {formData.iconUrl ? (
                <img
                  src={formData.iconUrl}
                  alt="Icon preview"
                  className="h-12 w-12 rounded-lg border object-cover"
                />
              ) : (
                <div className="h-12 w-12 rounded-lg border flex items-center justify-center text-gray-400">
                  No icon
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "image/*";
                  input.onchange = async (e) => {
                    const target = e.target as HTMLInputElement;
                    if (!target.files?.[0]) return;
                    const file = target.files[0];
                    if (!file.type.startsWith("image/")) return;
                    const uploadData = new FormData();
                    uploadData.append("file", file);
                    try {
                      const res = await fetch("/api/screenshots/upload", {
                        method: "POST",
                        body: uploadData,
                      });
                      if (res.ok) {
                        const data = await res.json();
                        setFormData((prev) => ({ ...prev, iconUrl: data.url }));
                      }
                    } catch (err) {
                      console.error("Icon upload failed:", err);
                    }
                  };
                  input.click();
                }}
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                {formData.iconUrl ? "Replace" : "Upload"}
              </button>
              {formData.iconUrl && (
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, iconUrl: "" }))}
                  className="text-sm text-gray-500 hover:text-red-500"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div>
            <label
              htmlFor="themeColor"
              className="mb-1 block text-sm font-medium"
            >
              Theme Color
            </label>
            <input
              type="color"
              id="themeColor"
              name="themeColor"
              value={formData.themeColor}
              onChange={handleChange}
              className="w-20 h-10 rounded-md border p-1"
            />
          </div>

          <div>
            <label
              htmlFor="author"
              className="mb-1 block text-sm font-medium"
            >
              Author
            </label>
            <input
              type="text"
              id="author"
              name="author"
              value={formData.author}
              onChange={handleChange}
              className="w-full rounded-md border p-2"
            />
          </div>

          <button
            type="submit"
            className="rounded-md bg-blue-500 px-4 py-2 text-white transition-colors hover:bg-blue-600"
          >
            Add Creation
          </button>
        </form>
      </div>
    </>
  );
}

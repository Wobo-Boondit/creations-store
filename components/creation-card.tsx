"use client";

import Link from "next/link";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Star, Archive, AppWindow, Download } from "lucide-react";
import { StarRating } from "@/components/star-rating";

interface CreationCardProps {
  creation: {
    id: string;
    url: string;
    title: string;
    description?: string | null;
    category?: {
      id: string;
      name: string;
      color?: string;
      icon?: string;
    };
    user?: {
      id: string;
      username: string;
    } | null;
    iconUrl?: string | null;
    favicon?: string | null;
    overview?: string | null;
    ogImage?: string | null;
    themeColor?: string | null;
    author?: string | null;
    screenshotUrl?: string | null;
    isArchived: boolean;
    isFavorite: boolean;
    slug: string;
    proxyCode?: string | null;
    averageRating?: {
      average: number;
      count: number;
    } | null;
  };
}

// Legacy alias for backward compatibility
export interface BookmarkCardProps extends CreationCardProps {
  bookmark: CreationCardProps["creation"];
}

export const CreationCard = ({ creation }: CreationCardProps) => {
  const [installDialogOpen, setInstallDialogOpen] = useState(false);

  const iconSrc = creation.iconUrl || creation.favicon || creation.ogImage;
  const accent = creation.themeColor || undefined;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  const proxyUrl = creation.proxyCode ? `${siteUrl}/go/${creation.proxyCode}` : creation.url;

  const qrCodeData = {
    title: creation.title,
    url: proxyUrl,
    description: creation.description || "",
    iconUrl: creation.iconUrl || "",
    themeColor: creation.themeColor || "",
    author: creation.author || "",
    installConfirmUrl: creation.proxyCode ? `${siteUrl}/api/analytics/install` : undefined,
  };

  const detailsUrl = `/${creation.id}-${creation.slug}`;

  return (
    <>
      <Link href={detailsUrl} className="group block h-full">
        <div
          className={cn(
            "relative flex flex-col overflow-hidden rounded-md border border-border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg h-full",
            "[&[style*='--card-accent']]:hover:border-[var(--card-accent)]",
            creation.isArchived && "opacity-75 hover:opacity-100",
          )}
          style={accent ? {
            // hover border color is controlled by group-hover via CSS var
            ["--card-accent" as string]: accent,
          } : undefined}
        >
          {/* Accent top bar */}
          {accent && (
            <div
              className="h-0.5 w-full"
              style={{ backgroundColor: accent }}
            />
          )}

          {/* Icon Header */}
          <div className="relative p-4 pb-3">
            <div className="flex items-start justify-between">
              <div
                className="flex items-center justify-center rounded-md border border-border bg-background p-2"
                style={accent ? { borderColor: `${accent}40` } : undefined}
              >
                {iconSrc ? (
                  <img
                    src={iconSrc}
                    alt={`${creation.title} icon`}
                    width={48}
                    height={48}
                    className="h-12 w-12 rounded-md"
                  />
                ) : (
                  <AppWindow
                    className="h-12 w-12 text-muted-foreground"
                    style={accent ? { color: `${accent}80` } : undefined}
                    aria-hidden="true"
                  />
                )}
              </div>

              <div className="flex gap-1.5">
                {creation.isFavorite && (
                  <Star
                    className="h-4 w-4"
                    style={{ color: accent || undefined }}
                    aria-label="Featured"
                  />
                )}
                {creation.isArchived && (
                  <Archive className="h-4 w-4 text-muted-foreground" aria-label="Archived" />
                )}
              </div>
            </div>

            {creation.category && (
              <div className="mt-3">
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                  style={accent ? {
                    backgroundColor: `${accent}18`,
                    color: accent,
                  } : {
                    backgroundColor: "hsl(var(--muted))",
                    color: "hsl(var(--muted-foreground))",
                  }}
                >
                  {creation.category.name}
                </span>
              </div>
            )}
          </div>

          {/* Info Section */}
          <div className="flex flex-1 flex-col p-4 pt-0 space-y-2">
            <div className="space-y-1">
              <h3
                className="truncate text-sm font-medium text-foreground"
                style={accent ? { color: accent } : undefined}
              >
                {creation.title}
              </h3>
              {(creation.author || creation.user) && (
                <p className="truncate text-xs text-muted-foreground">
                  {creation.author ? `by ${creation.author}` : null}
                  {creation.author && creation.user ? " · " : null}
                  {creation.user && `added by ${creation.user.username}`}
                </p>
              )}
              {creation.averageRating && creation.averageRating.count > 0 && (
                <StarRating
                  rating={creation.averageRating.average}
                  count={creation.averageRating.count}
                  size="sm"
                />
              )}
            </div>

            {creation.description && (
              <p className="line-clamp-2 text-xs text-muted-foreground">
                {creation.description}
              </p>
            )}

            <div className="pt-1">
              <Button
                variant="outline"
                size="sm"
                className={cn("w-full chromatic-press", !accent && "")}
                style={accent ? {
                  borderColor: `${accent}40`,
                  color: accent,
                } : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setInstallDialogOpen(true);
                }}
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Install
              </Button>
            </div>
          </div>
        </div>
      </Link>

      {/* Install Dialog with QR Code */}
      <Dialog open={installDialogOpen} onOpenChange={setInstallDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Install {creation.title}</DialogTitle>
            <DialogDescription>
              Scan this QR code to install this creation
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center space-y-4 py-4">
            <div className="rounded-md border border-border p-6 bg-white">
              <QRCodeSVG
                value={JSON.stringify(qrCodeData)}
                size={250}
                level={"M"}
              />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Point your R1 camera at the QR code to install
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

// Legacy component alias for backward compatibility
export const BookmarkCard = ({ bookmark }: BookmarkCardProps) => <CreationCard creation={bookmark} />;

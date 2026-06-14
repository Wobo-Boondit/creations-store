"use client";

import Link from "next/link";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Badge } from "@/components/ui/badge";
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

  // Use iconUrl first, then fallback to favicon, then ogImage
  const iconSrc = creation.iconUrl || creation.favicon || creation.ogImage;

  // Get site URL for proxy links
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '');

  // Use proxy URL if proxyCode is available, otherwise use direct URL
  const proxyUrl = creation.proxyCode ? `${siteUrl}/go/${creation.proxyCode}` : creation.url;

  // Prepare QR code data (with proxy URL for tracking if available)
  const qrCodeData = {
    title: creation.title,
    url: proxyUrl,
    description: creation.description || "",
    iconUrl: creation.iconUrl || "",
    themeColor: creation.themeColor || "",
    author: creation.author || "",
    // Add tracking callback for install confirmation
    installConfirmUrl: creation.proxyCode ? `${siteUrl}/api/analytics/install` : undefined,
  };

  // Create URL in format: id-slug (for SEO and handling duplicates)
  const detailsUrl = `/${creation.id}-${creation.slug}`;

  return (
    <>
      <Link href={detailsUrl} className="block h-full">
        <div
          className={cn(
            "not-prose group relative flex flex-col overflow-hidden rounded-2xl border-2 bg-card transition-all duration-300 hover:shadow-xl hover:-translate-y-1 h-full",
            creation.isArchived && "opacity-75 hover:opacity-100",
          )}
          style={creation.themeColor ? {
            borderColor: creation.themeColor,
          } : undefined}
        >
        {/* App Icon Header */}
        <div
          className="relative p-6 pb-4"
          style={creation.themeColor ? {
            background: `linear-gradient(135deg, ${creation.themeColor}15 0%, ${creation.themeColor}05 100%)`,
          } : undefined}
        >
          <div className="flex items-start justify-between">
            {/* App Icon */}
            <div
              className="flex items-center justify-center rounded-2xl border-2 bg-background p-3 shadow-sm"
              style={creation.themeColor ? {
                borderColor: creation.themeColor,
              } : undefined}
            >
              {iconSrc ? (
                <img
                  src={iconSrc}
                  alt={`${creation.title} icon`}
                  width={64}
                  height={64}
                  className="h-16 w-16 rounded-xl"
                />
              ) : (
                <AppWindow
                  className="h-16 w-16 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
            </div>

            {/* Status Badges */}
            <div className="flex gap-1.5">
              {creation.isFavorite && (
                <Badge
                  variant="secondary"
                  className="bg-yellow-500/10 text-yellow-500 backdrop-blur-sm"
                >
                  <Star className="h-3 w-3" aria-label="Featured" />
                </Badge>
              )}
              {creation.isArchived && (
                <Badge
                  variant="secondary"
                  className="bg-gray-500/10 text-gray-500 backdrop-blur-sm"
                >
                  <Archive className="h-3 w-3" aria-label="Archived" />
                </Badge>
              )}
            </div>
          </div>

          {/* Category Badge */}
          {creation.category && (
            <div className="mt-3">
              <Badge
                variant="outline"
                className="border-0 bg-background/50 backdrop-blur-sm text-xs font-medium"
                style={creation.category.color ? {
                  backgroundColor: `${creation.category.color}22`,
                  color: creation.category.color,
                } : undefined}
              >
                {creation.category.name}
              </Badge>
            </div>
          )}
        </div>

        {/* App Info Section */}
        <div className="flex flex-1 flex-col p-4 space-y-3">
          {/* Title and Description */}
          <div className="space-y-1">
            <h2 className="font-semibold text-lg leading-tight tracking-tight" style={creation.themeColor ? {
              color: creation.themeColor,
            } : undefined}>
              {creation.title}
            </h2>
            {/* Author or User */}
            {(creation.author || creation.user) && (
              <span className="text-sm text-muted-foreground">
                {creation.author ? `by ${creation.author}` : null}
                {creation.author && creation.user ? " • " : null}
                {creation.user && (
                  <span className="hover:text-foreground transition-colors">
                    added by {creation.user.username}
                  </span>
                )}
              </span>
            )}
            {/* Rating */}
            {creation.averageRating && creation.averageRating.count > 0 && (
              <div>
                <StarRating
                  rating={creation.averageRating.average}
                  count={creation.averageRating.count}
                  size="sm"
                />
              </div>
            )}
          </div>

          {/* Description */}
          {creation.description && (
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {creation.description}
            </p>
          )}

          {/* Install Button */}
          <div className="pt-2">
            <Button
              variant="default"
              size="sm"
              className="w-full font-medium"
              style={creation.themeColor ? {
                backgroundColor: creation.themeColor,
              } : undefined}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setInstallDialogOpen(true);
              }}
            >
              <Download className="h-4 w-4 mr-2" />
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
            <div className="rounded-lg border-2 p-6 bg-white">
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
"use client";

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
import { Download, Share2, Check, BarChart3 } from "lucide-react";
import Link from "next/link";

interface CreationActionsProps {
  title: string;
  url: string;
  description?: string | null;
  iconUrl?: string | null;
  themeColor?: string | null;
  author?: string | null;
  pageUrl: string;
  proxyCode?: string | null;
  creationId?: string;
  isOwner?: boolean;
}

export const CreationActions = ({
  title,
  url,
  description,
  iconUrl,
  themeColor,
  author,
  pageUrl,
  proxyCode,
  creationId,
  isOwner = false,
}: CreationActionsProps) => {
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Get site URL for proxy links
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '');

  // Use proxy URL if proxyCode is available, otherwise use direct URL
  const proxyUrl = proxyCode ? `${siteUrl}/go/${proxyCode}` : url;

  // Prepare QR code data with proxy URL for tracking
  const qrCodeData = {
    title,
    url: proxyUrl, // Use proxy URL for tracking
    description: description || "",
    iconUrl: iconUrl || "",
    themeColor: themeColor || "",
    author: author || "",
    // Add tracking callback for install confirmation
    installConfirmUrl: proxyCode ? `${siteUrl}/api/analytics/install` : undefined,
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <Button
          size="lg"
          className="flex-1 sm:flex-none"
          style={themeColor ? {
            backgroundColor: themeColor,
          } : undefined}
          onClick={() => setInstallDialogOpen(true)}
        >
          <Download className="h-5 w-5 mr-2" />
          Install
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="flex-1 sm:flex-none"
          onClick={handleShare}
        >
          {copied ? (
            <>
              <Check className="h-5 w-5 mr-2" />
              Copied!
            </>
          ) : (
            <>
              <Share2 className="h-5 w-5 mr-2" />
              Share
            </>
          )}
        </Button>
        {isOwner && creationId && (
          <Button
            size="lg"
            variant="outline"
            className="flex-1 sm:flex-none"
            asChild
          >
            <Link href={`/analytics/${creationId}`}>
              <BarChart3 className="h-5 w-5 mr-2" />
              Analytics
            </Link>
          </Button>
        )}
      </div>

      {/* Install Dialog with QR Code */}
      <Dialog open={installDialogOpen} onOpenChange={setInstallDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Install {title}</DialogTitle>
            <DialogDescription>
              Scan this QR code to install this creation
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center space-y-4 py-4">
            <div className="rounded-lg border-2 p-6 bg-white">
              <QRCodeSVG
                value={JSON.stringify(qrCodeData)}
                size={350}
                level={"M"}
              />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Point your R1 camera at the QR code to install
            </p>
            {proxyCode && (
              <p className="text-xs text-muted-foreground text-center">
                Analytics tracking enabled via proxy URL
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

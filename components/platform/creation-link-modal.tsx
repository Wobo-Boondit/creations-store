"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, QrCode, Check, Copy, Camera, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { createBrowserClient } from "@/lib/supabase/client";

interface LinkModalProps {
  clientId: string;
  clientName: string;
  open: boolean;
  onClose: () => void;
}

interface PairResponse {
  token: string;
  expiresAt: string;
  clientId: string;
}

export function CreationLinkModal({ clientId, clientName, open, onClose }: LinkModalProps) {
  const [pairData, setPairData] = useState<PairResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [linked, setLinked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  const generateToken = useCallback(async () => {
    setLoading(true);
    setLinked(false);
    try {
      const res = await fetch("/api/oauth/pair-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      if (!res.ok) throw new Error("Failed to generate token");
      const data = await res.json();
      setPairData(data);
      setTimeLeft(900); // 15 min
    } catch (err) {
      toast.error("Failed to generate pairing code");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  // Generate token on open
  useEffect(() => {
    if (open && !pairData) {
      generateToken();
    }
    if (!open) {
      setPairData(null);
      setLinked(false);
    }
  }, [open]);

  // Countdown timer
  useEffect(() => {
    if (!pairData || linked) return;
    const interval = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          setPairData(null);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [pairData, linked]);

  // Realtime subscription for link completion
  useEffect(() => {
    if (!pairData) return;
    const supabase = createBrowserClient();
    const channel = supabase
      .channel(`pair-${pairData.token}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "creation_pairing_tokens",
          filter: `token=eq.${pairData.token}`,
        },
        (payload: any) => {
          if (payload.new?.used === true && payload.new?.device_id) {
            setLinked(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [pairData]);

  const handleCopy = () => {
    if (!pairData) return;
    navigator.clipboard.writeText(pairData.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  const qrPayload = pairData
    ? JSON.stringify({
        type: "boondit_link",
        clientId,
        token: pairData.token,
        endpoint: `${window.location.origin}/api/oauth/link`,
      })
    : "";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            Link {clientName}
          </DialogTitle>
          <DialogDescription>
            Scan this QR code on your R1 to link your Boondit account
          </DialogDescription>
        </DialogHeader>

        {linked ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center">
              <Check className="h-8 w-8 text-green-500" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-lg">Linked successfully</p>
              <p className="text-sm text-muted-foreground">
                Your R1 is now connected to {clientName}
              </p>
            </div>
            <Button onClick={onClose}>Done</Button>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !pairData ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <p className="text-sm text-muted-foreground">
              {timeLeft === 0 ? "Code expired" : "No active pairing code"}
            </p>
            <Button onClick={generateToken} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Generate new code
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-4">
            {/* QR Code */}
            <div className="rounded-xl border-2 border-border p-4 bg-white">
              <QRCodeSVG value={qrPayload} size={200} level="M" />
            </div>

            {/* Instructions */}
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <Camera className="h-4 w-4 mt-0.5 shrink-0" />
              <p>Open {clientName} on your R1 and scan this code</p>
            </div>

            {/* Token (copyable, for manual entry) */}
            <div className="w-full">
              <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-2">
                <code className="flex-1 text-xs font-mono truncate px-2">
                  {pairData.token.slice(0, 8)}-{pairData.token.slice(8, 12)}-{pairData.token.slice(12, 16)}-{pairData.token.slice(16)}
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCopy}
                  className="h-7 px-2"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5 text-center">
                Expires in {minutes}:{seconds.toString().padStart(2, "0")}
              </p>
            </div>

            {/* Waiting indicator */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Waiting for R1...
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

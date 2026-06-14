"use client";

import { useState, useTransition } from "react";
import { updateProfile, signOut } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Check, LogOut } from "lucide-react";
import { toast } from "sonner";
import type { CurrentUser } from "@/lib/auth";

export function AccountSettings({ user }: { user: CurrentUser }) {
  const [username, setUsername] = useState(user.username || user.name);
  const [isPending, startTransition] = useTransition();

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateProfile(null, { username });
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Profile updated");
      }
    });
  };

  return (
    <div className="space-y-8">
      {/* Profile card */}
      <div className="rounded-xl border bg-card p-6 space-y-6">
        <div className="flex items-center gap-4">
          {user.avatar ? (
            <img
              src={user.avatar}
              alt={user.name}
              className="h-16 w-16 rounded-full border"
            />
          ) : (
            <div className="h-16 w-16 rounded-full border bg-muted flex items-center justify-center text-xl font-bold">
              {user.name?.[0]?.toUpperCase() || "?"}
            </div>
          )}
          <div>
            <p className="font-semibold text-lg">{user.name}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="username">Display Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Your username"
              maxLength={32}
            />
            <p className="text-xs text-muted-foreground">
              This name appears across all Boondit services
            </p>
          </div>
          <Button type="submit" disabled={isPending || username === (user.username || user.name)}>
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </form>
      </div>

      {/* Connected services */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <h3 className="font-semibold">Connected Services</h3>
        <p className="text-sm text-muted-foreground">
          Your Boondit account works across these services:
        </p>

        <div className="space-y-3">
          <ServiceRow
            name="Creations"
            url="https://creations.boondit.site"
            connected
          />
          <ServiceRow
            name="Rhythm"
            url="https://rhythm.boondit.site"
            connected
          />
        </div>

        <div className="pt-3 border-t">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-[#5865F2] flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-white">
                <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.182 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Discord</p>
              <p className="text-xs text-muted-foreground">
                Signed in via Discord OAuth
              </p>
            </div>
            <span className="text-xs text-green-500 flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              Connected
            </span>
          </div>
        </div>
      </div>

      {/* Account info */}
      <div className="rounded-xl border bg-card p-6 space-y-3">
        <h3 className="font-semibold">Account Details</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground">Account ID</p>
            <p className="font-mono text-xs truncate">{user.id}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Role</p>
            <p>{user.isAdmin ? "Admin" : "Member"}</p>
          </div>
        </div>
      </div>

      {/* Sign out */}
      <form action={signOut} className="rounded-xl border border-red-900/30 bg-red-950/20 p-6 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-red-400">Sign Out</h3>
          <p className="text-sm text-muted-foreground">
            Sign out of your Boondit account on this device
          </p>
        </div>
        <Button type="submit" variant="outline" className="border-red-900/50 text-red-400 hover:bg-red-900/20 hover:text-red-400">
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </form>
    </div>
  );
}

function ServiceRow({
  name,
  url,
  connected,
}: {
  name: string;
  url: string;
  connected: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">{url}</p>
      </div>
      {connected ? (
        <span className="text-xs text-green-500 flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          Active
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">Not connected</span>
      )}
    </div>
  );
}

import { createAdminClient } from "@/lib/supabase/admin";

export interface CreationAnalytics {
  totalClicks: number;
  uniqueClicks: number;
  totalInstalls: number;
  installRate: number; // installs / clicks
  avgDailyClicks: number;
  avgDailyInstalls: number;
  retention7Day: number; // Returning visitors over 7 days
  retention30Day: number; // Returning visitors over 30 days
  activeUsers7Day: number;
  activeUsers30Day: number;
}

export interface DailyStats {
  date: string;
  clicks: number;
  uniqueClicks: number;
  installs: number;
  activeUsers: number;
}

export interface ReferrerStats {
  referrer: string;
  clicks: number;
  percentage: number;
}

export interface DeviceStats {
  device: string;
  clicks: number;
  percentage: number;
}

function db() {
  return createAdminClient();
}

/**
 * Get comprehensive analytics for a creation
 */
export async function getCreationAnalytics(creationId: string): Promise<CreationAnalytics> {
  const supabase = db();
  const id = creationId;

  const empty: CreationAnalytics = {
    totalClicks: 0,
    uniqueClicks: 0,
    totalInstalls: 0,
    installRate: 0,
    avgDailyClicks: 0,
    avgDailyInstalls: 0,
    retention7Day: 0,
    retention30Day: 0,
    activeUsers7Day: 0,
    activeUsers30Day: 0,
  };
  if (id == null) return empty;

  const now = Date.now();
  const sevenDaysAgoMs = now - 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgoMs = now - 30 * 24 * 60 * 60 * 1000;

  // Fetch all clicks for the creation
  const { data: clicks } = await supabase
    .from("store_clicks")
    .select("session_id, user_agent, clicked_at")
    .eq("creation_id", id);

  const clickRows = clicks || [];
  const totalClicks = clickRows.length;
  const uniqueSessions = new Set(clickRows.map((c: any) => c.session_id));
  const uniqueClicks = uniqueSessions.size;

  // Fetch installs
  const { count: totalInstalls } = await supabase
    .from("store_installs")
    .select("*", { count: "exact", head: true })
    .eq("creation_id", id);

  const installs = totalInstalls || 0;
  const installRate = totalClicks > 0 ? (installs / totalClicks) * 100 : 0;

  // Daily stats for averages
  const { data: dailyStatsRows } = await supabase
    .from("store_daily_stats")
    .select("*")
    .eq("creation_id", id)
    .order("date", { ascending: false })
    .limit(30);

  const daily = dailyStatsRows || [];
  const avgDailyClicks =
    daily.length > 0
      ? daily.reduce((sum: number, s: any) => sum + (s.clicks || 0), 0) / daily.length
      : 0;
  const avgDailyInstalls =
    daily.length > 0
      ? daily.reduce((sum: number, s: any) => sum + (s.installs || 0), 0) / daily.length
      : 0;

  // Active users (unique sessions in window)
  const activeUsers7Day = countUniqueSessionsSince(clickRows, sevenDaysAgoMs);
  const activeUsers30Day = countUniqueSessionsSince(clickRows, thirtyDaysAgoMs);

  // Retention: sessions that first clicked before cutoff AND returned after cutoff
  const retention7Day = calculateRetention(clickRows, sevenDaysAgoMs);
  const retention30Day = calculateRetention(clickRows, thirtyDaysAgoMs);

  return {
    totalClicks,
    uniqueClicks,
    totalInstalls: installs,
    installRate: Math.round(installRate * 10) / 10,
    avgDailyClicks: Math.round(avgDailyClicks * 10) / 10,
    avgDailyInstalls: Math.round(avgDailyInstalls * 10) / 10,
    retention7Day: Math.round(retention7Day * 10) / 10,
    retention30Day: Math.round(retention30Day * 10) / 10,
    activeUsers7Day,
    activeUsers30Day,
  };
}

function countUniqueSessionsSince(clickRows: any[], sinceMs: number): number {
  const sessions = new Set<string>();
  for (const c of clickRows) {
    if (parseTime(c.clicked_at) >= sinceMs) {
      sessions.add(c.session_id);
    }
  }
  return sessions.size;
}

function calculateRetention(clickRows: any[], cutoffMs: number): number {
  const beforeSessions = new Set<string>();
  const afterSessions = new Set<string>();
  for (const c of clickRows) {
    const t = parseTime(c.clicked_at);
    if (t <= cutoffMs) beforeSessions.add(c.session_id);
    else afterSessions.add(c.session_id);
  }
  if (beforeSessions.size === 0) return 0;
  let returned = 0;
  beforeSessions.forEach((s) => {
    if (afterSessions.has(s)) returned++;
  });
  return (returned / beforeSessions.size) * 100;
}

function parseTime(v: any): number {
  if (!v) return 0;
  if (typeof v === "number") return v; // unix seconds or ms
  const t = new Date(v).getTime();
  return isNaN(t) ? 0 : t;
}

/**
 * Get daily stats for a creation over a period
 */
export async function getCreationDailyStats(
  creationId: string,
  days: number = 30
): Promise<DailyStats[]> {
  const supabase = db();
  const id = creationId;
  if (!id) return [];

  const startDateStr = new Date(now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  // Try aggregated stats table first
  const { data: aggregated } = await supabase
    .from("store_daily_stats")
    .select("*")
    .eq("creation_id", id)
    .gte("date", startDateStr)
    .order("date", { ascending: false });

  if (aggregated && aggregated.length > 0) {
    return aggregated.map((s: any) => ({
      date: s.date,
      clicks: s.clicks || 0,
      uniqueClicks: s.unique_clicks || 0,
      installs: s.installs || 0,
      activeUsers: s.active_users || 0,
    }));
  }

  // Fallback: calculate from raw clicks data
  const sinceMs = now() - days * 24 * 60 * 60 * 1000;
  const { data: clickRows } = await supabase
    .from("store_clicks")
    .select("session_id, clicked_at")
    .eq("creation_id", id)
    .gte("clicked_at", new Date(sinceMs).toISOString());

  const byDate = new Map<string, { clicks: number; sessions: Set<string> }>();
  for (const c of clickRows || []) {
    const dateStr = new Date(parseTime(c.clicked_at)).toISOString().split("T")[0];
    if (!byDate.has(dateStr)) byDate.set(dateStr, { clicks: 0, sessions: new Set() });
    const entry = byDate.get(dateStr)!;
    entry.clicks += 1;
    entry.sessions.add(c.session_id);
  }

  return Array.from(byDate.entries())
    .map(([date, entry]) => ({
      date,
      clicks: entry.clicks,
      uniqueClicks: entry.sessions.size,
      installs: 0,
      activeUsers: 0,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/**
 * Get top referrers for a creation
 */
export async function getTopReferrers(creationId: string, limit: number = 10): Promise<ReferrerStats[]> {
  const supabase = db();
  const id = creationId;
  if (!id) return [];

  const { data: clickRows } = await supabase
    .from("store_clicks")
    .select("referrer")
    .eq("creation_id", id);

  const counts: Record<string, number> = {};
  const rows = clickRows || [];
  const totalClicks = rows.length;
  for (const c of rows as any[]) {
    const key = c.referrer || "Direct";
    counts[key] = (counts[key] || 0) + 1;
  }

  return Object.entries(counts)
    .map(([referrer, clicks]) => ({
      referrer,
      clicks,
      percentage: totalClicks > 0 ? (clicks / totalClicks) * 100 : 0,
    }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, limit);
}

/**
 * Get device breakdown from user agents
 */
export async function getDeviceBreakdown(creationId: string): Promise<DeviceStats[]> {
  const supabase = db();
  const id = creationId;
  if (!id) return [];

  const { data: clickRows } = await supabase
    .from("store_clicks")
    .select("user_agent")
    .eq("creation_id", id);

  const deviceCounts: Record<string, number> = {};
  const rows = clickRows || [];
  for (const c of rows as any[]) {
    const device = detectDevice(c.user_agent || "");
    deviceCounts[device] = (deviceCounts[device] || 0) + 1;
  }

  const totalClicks = Object.values(deviceCounts).reduce((sum, count) => sum + count, 0);

  return Object.entries(deviceCounts)
    .map(([device, count]) => ({
      device,
      clicks: count,
      percentage: totalClicks > 0 ? (count / totalClicks) * 100 : 0,
    }))
    .sort((a, b) => b.clicks - a.clicks);
}

/**
 * Detect device type from user agent
 */
function detectDevice(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (ua.includes("iphone") || ua.includes("ipad")) return "iOS";
  if (ua.includes("android")) return "Android";
  if (ua.includes("mac")) return "macOS";
  if (ua.includes("windows")) return "Windows";
  if (ua.includes("linux")) return "Linux";
  if (ua.includes("bot") || ua.includes("crawler") || ua.includes("spider"))
    return "Bot";
  return "Unknown";
}

/**
 * Aggregate daily stats - should be run periodically (e.g., via cron)
 */
export async function aggregateDailyStats(date: string): Promise<void> {
  const supabase = db();
  const dayStart = new Date(date);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  // Get all creations that had clicks on this date
  const { data: creationsWithClicks } = await supabase
    .from("store_clicks")
    .select("creation_id")
    .gte("clicked_at", dayStart.toISOString())
    .lt("clicked_at", dayEnd.toISOString());

  const creationIds = Array.from(
    new Set((creationsWithClicks || []).map((c: any) => c.creation_id))
  );

  for (const creationId of creationIds) {
    const { data: dayClicks } = await supabase
      .from("store_clicks")
      .select("session_id")
      .eq("creation_id", creationId)
      .gte("clicked_at", dayStart.toISOString())
      .lt("clicked_at", dayEnd.toISOString());

    const clicks = dayClicks?.length || 0;
    const uniqueClicks = new Set((dayClicks || []).map((c: any) => c.session_id)).size;

    const { count: installs } = await supabase
      .from("store_installs")
      .select("*", { count: "exact", head: true })
      .eq("creation_id", creationId)
      .gte("installed_at", dayStart.toISOString())
      .lt("installed_at", dayEnd.toISOString());

    // Active users in the last 30 days up to end of this day
    const { data: activeRows } = await supabase
      .from("store_clicks")
      .select("session_id")
      .eq("creation_id", creationId)
      .lt("clicked_at", dayEnd.toISOString());
    const activeUsers = new Set((activeRows || []).map((c: any) => c.session_id)).size;

    // Upsert daily stats
    const { data: existing } = await supabase
      .from("store_daily_stats")
      .select("id")
      .eq("creation_id", creationId)
      .eq("date", date)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("store_daily_stats")
        .update({
          clicks,
          unique_clicks: uniqueClicks,
          installs: installs || 0,
          active_users: activeUsers,
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("store_daily_stats").insert({
        creation_id: creationId,
        date,
        clicks,
        unique_clicks: uniqueClicks,
        installs: installs || 0,
        active_users: activeUsers,
      });
    }
  }
}

/**
 * Record an install event
 */
export async function recordInstall(
  proxyCode: string,
  sessionId: string,
  userAgent?: string
): Promise<boolean> {
  const supabase = db();

  const { data: creation } = await supabase
    .from("store_creations")
    .select("id, url")
    .eq("proxy_code", proxyCode)
    .maybeSingle();

  if (!creation) return false;

  // Check if this session already installed this creation (prevent duplicates)
  const { data: existingInstall } = await supabase
    .from("store_installs")
    .select("id")
    .eq("creation_id", creation.id)
    .eq("session_id", sessionId)
    .maybeSingle();

  if (existingInstall) return true; // Already installed

  // Record the install
  await supabase.from("store_installs").insert({
    creation_id: creation.id,
    session_id: sessionId,
    user_agent: userAgent || null,
    installed_at: new Date().toISOString(),
  });

  return true;
}

/**
 * Get creation by proxy code
 */
export async function getCreationByProxyCode(proxyCode: string) {
  const supabase = db();
  const { data } = await supabase
    .from("store_creations")
    .select("*")
    .eq("proxy_code", proxyCode)
    .maybeSingle();

  return data || null;
}

function now(): number {
  return Date.now();
}

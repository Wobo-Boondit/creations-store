import dns from "dns";
import net from "net";

// Shared SSRF guard: resolve a hostname and reject anything that maps to a
// private/internal/loopback/link-local address. Extracted from the metadata
// route so the import endpoint can reuse the exact same protection.

export async function isPrivateHost(hostname: string): Promise<boolean> {
  if (
    hostname === "localhost" ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".local") ||
    hostname === "metadata.google.internal"
  ) {
    return true;
  }

  if (net.isIP(hostname)) {
    return isPrivateIp(hostname);
  }

  try {
    const addresses = await dns.promises.lookup(hostname, { all: true });
    for (const addr of addresses) {
      if (isPrivateIp(addr.address)) return true;
    }
  } catch {
    // DNS resolution failed — block by default.
    return true;
  }
  return false;
}

export function isPrivateIp(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length === 4 && parts.every((p) => p >= 0 && p <= 255)) {
    if (parts[0] === 127) return true; // loopback
    if (parts[0] === 10) return true; // 10/8
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16/12
    if (parts[0] === 192 && parts[1] === 168) return true; // 192.168/16
    if (parts[0] === 169 && parts[1] === 254) return true; // link-local / cloud metadata
    if (parts[0] === 0) return true;
  }

  const lower = ip.toLowerCase();
  if (
    lower === "::1" ||
    lower === "::" ||
    lower.startsWith("fe80:") ||
    lower.startsWith("fc") ||
    lower.startsWith("fd")
  ) {
    return true;
  }

  const v4Mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)/);
  if (v4Mapped) return isPrivateIp(v4Mapped[1]);

  return false;
}

/**
 * Validate a remote URL is a fetchable public http(s) resource (no SSRF).
 * Returns the parsed URL or null with a reason.
 */
export async function assertPublicHttpUrl(
  raw: string,
): Promise<{ url: URL } | { error: string }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { error: "invalid_url" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { error: "bad_scheme" };
  }
  if (await isPrivateHost(url.hostname)) {
    return { error: "private_host" };
  }
  return { url };
}

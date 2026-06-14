import { NextResponse } from "next/server";
import { load } from "cheerio";
import { getCurrentUser } from "@/lib/auth";

// Block requests to internal/private IPs to prevent SSRF
function isPrivateUrl(url: URL): boolean {
  const host = url.hostname;
  // Block loopback, link-local, private ranges, cloud metadata
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.startsWith("169.254.") || // link-local
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    host.startsWith("172.16.") ||
    host.startsWith("172.17.") ||
    host.startsWith("172.18.") ||
    host.startsWith("172.19.") ||
    host.startsWith("172.20.") ||
    host.startsWith("172.21.") ||
    host.startsWith("172.22.") ||
    host.startsWith("172.23.") ||
    host.startsWith("172.24.") ||
    host.startsWith("172.25.") ||
    host.startsWith("172.26.") ||
    host.startsWith("172.27.") ||
    host.startsWith("172.28.") ||
    host.startsWith("172.29.") ||
    host.startsWith("172.30.") ||
    host.startsWith("172.31.") ||
    host === "metadata.google.internal" ||
    host.endsWith(".internal")
  ) {
    return true;
  }
  return false;
}

export async function GET(request: Request) {
  // Require authentication — prevent anonymous SSRF
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Validate and normalize URL — http/https only
    let validUrl: URL;
    try {
      validUrl = new URL(url);
      if (!validUrl.protocol || validUrl.protocol === ":") {
        validUrl = new URL(`https://${url}`);
      }
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 },
      );
    }

    // Block non-http(s) schemes (prevents file:, javascript:, etc.)
    if (validUrl.protocol !== "http:" && validUrl.protocol !== "https:") {
      return NextResponse.json(
        { error: "Only http and https URLs are allowed" },
        { status: 400 },
      );
    }

    // Block SSRF — no internal/private IPs
    if (isPrivateUrl(validUrl)) {
      return NextResponse.json(
        { error: "URL not accessible" },
        { status: 403 },
      );
    }

    const response = await fetch(validUrl.toString(), {
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; CreationsBot/1.0)",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch URL: ${response.statusText}` },
        { status: response.status },
      );
    }

    const html = await response.text();
    const $ = load(html);

    // Get favicon
    let faviconUrl =
      $('link[rel="icon"]').attr("href") ||
      $('link[rel="shortcut icon"]').attr("href") ||
      $('link[rel="apple-touch-icon"]').attr("href") ||
      "/favicon.ico"; // Default fallback

    // If favicon is relative, make it absolute
    if (faviconUrl && !faviconUrl.startsWith("http")) {
      try {
        faviconUrl = new URL(faviconUrl, validUrl.origin).toString();
      } catch (e) {
        console.warn("Failed to parse favicon URL:", e);
        faviconUrl = "/favicon.ico";
      }
    }

    // Get Open Graph image
    let ogImage =
      $('meta[property="og:image"]').attr("content") ||
      $('meta[name="twitter:image"]').attr("content");

    // Make ogImage URL absolute if it's relative
    if (ogImage && !ogImage.startsWith("http")) {
      try {
        ogImage = new URL(ogImage, validUrl.origin).toString();
      } catch (e) {
        console.warn("Failed to parse ogImage URL:", e);
        ogImage = "";
      }
    }

    // Get title and description
    const title =
      $('meta[property="og:title"]').attr("content") ||
      $("title").text().trim() ||
      validUrl.hostname;

    const description =
      $('meta[property="og:description"]').attr("content") ||
      $('meta[name="description"]').attr("content") ||
      "";

    const metadata = {
      favicon: faviconUrl,
      ogImage,
      title,
      description,
      url: validUrl.toString(),
    };

    console.log("Generated metadata:", metadata);

    return NextResponse.json(metadata);
  } catch (error) {
    const statusCode = error instanceof Error ? 500 : (error as { statusCode?: number }).statusCode || 500;
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error("Error fetching metadata:", errorMessage);
    return NextResponse.json(
      { error: `Failed to fetch or parse metadata: ${errorMessage}` },
      { status: statusCode },
    );
  }
}

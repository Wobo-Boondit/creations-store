import type { Metadata, Viewport } from "next";

// The R1 WebView opens this route directly at 240×282px. We render the client
// inside a fixed 240×282 canvas scaled to fill the viewport — identical on the
// device, in a desktop browser, and under devtools-zoom. The fixed viewport
// also sits above the site Header/Footer (z-index) so the R1's tiny screen
// isn't eaten by nav chrome meant for the desktop directory.
//
// Mirrors rhythm's app/creation/layout.tsx.

export const metadata: Metadata = {
  title: "R1A Client",
};

export const viewport: Viewport = {
  width: 240,
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function R1AClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="r1a-viewport">
      <div className="r1a-canvas">{children}</div>
    </div>
  );
}

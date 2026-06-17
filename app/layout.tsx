import type { Metadata } from "next";
import "./globals.css";
import local from "next/font/local";
import { getCurrentUser } from "@/lib/auth";
import { directory } from "@/directory.config";
import { SiteChrome } from "@/components/site-chrome";

const font = local({
  src: "./fonts/PowerGrotesk-Regular.ttf",
  display: "swap",
  variable: "--font-power-grotesk",
});

export const metadata: Metadata = {
  title: directory.title,
  description: directory.description,
  metadataBase: new URL(directory.baseUrl),
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  // SiteChrome renders the Header/Footer for normal routes, but renders
  // children bare on device routes like /r1a_client (the R1 WebView). We only
  // pass the bits the header needs so the user object isn't serialized wholesale
  // to the client.
  return (
    <html lang="en">
      <body className={`${font.className} ${font.variable} antialiased`}>
        <SiteChrome
          user={
            user
              ? {
                  id: user.id,
                  username: user.username || user.name,
                  avatarUrl: user.avatar,
                  isAdmin: user.isAdmin,
                }
              : null
          }
        >
          {children}
        </SiteChrome>
      </body>
    </html>
  );
}

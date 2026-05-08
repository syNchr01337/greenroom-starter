import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";

export const metadata: Metadata = {
  title: {
    default: "Greenroom · The Crescent",
    template: "%s · Greenroom",
  },
  description:
    "Operating system for independent music venues. Bookings, settlement, advancing — in one place.",
  applicationName: "Greenroom",
  authors: [{ name: "Greenroom" }],
  keywords: [
    "music venue software",
    "independent venues",
    "settlement",
    "venue operations",
    "ticketing",
    "indie music",
  ],
  openGraph: {
    type: "website",
    title: "Greenroom",
    description:
      "Operating system for independent music venues. Bookings, settlement, advancing — in one place.",
    siteName: "Greenroom",
  },
  twitter: {
    card: "summary_large_image",
    title: "Greenroom",
    description:
      "Operating system for independent music venues.",
  },
  robots: {
    index: false, // candidate-facing instance — we don't want it indexed
    follow: false,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f0" },
    { media: "(prefers-color-scheme: dark)", color: "#181712" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex font-sans">
        <Sidebar />
        <main className="flex-1 overflow-auto relative">{children}</main>
      </body>
    </html>
  );
}

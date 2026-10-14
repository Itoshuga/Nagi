import type { Metadata } from "next";
import localFont from "next/font/local";
import { copy } from "@/data/fr";
import "./globals.css";

const editorial = localFont({
  src: [
    { path: "./fonts/cormorant-garamond-latin.woff2", weight: "400 500", style: "normal" },
    { path: "./fonts/cormorant-garamond-italic-latin.woff2", weight: "400 500", style: "italic" },
  ],
  variable: "--font-editorial",
  display: "swap",
});

const body = localFont({
  src: "./fonts/manrope-latin.woff2",
  weight: "400 500",
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: copy.metadata.title,
  description: copy.metadata.description,
  applicationName: "Nagi",
  openGraph: {
    title: copy.metadata.title,
    description: copy.metadata.description,
    locale: "fr_FR",
    type: "website",
    siteName: "Nagi",
  },
  twitter: { card: "summary", title: copy.metadata.title, description: copy.metadata.description },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" data-scroll-behavior="smooth" className={`${editorial.variable} ${body.variable}`}>
      <body><a href="#contenu" className="skip-link">Aller au contenu</a>{children}</body>
    </html>
  );
}

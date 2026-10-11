import type { Metadata } from "next";

export function destinationMetadata(name: string, description: string, canonical?: string): Metadata {
  const title = `${name} — Le carnet Nagi`;
  return {
    title,
    description,
    ...(canonical ? { alternates: { canonical } } : {}),
    openGraph: { title, description, type: "website", locale: "fr_FR", siteName: "Nagi" },
    twitter: { card: "summary", title, description },
  };
}

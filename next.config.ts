import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  // Interdire aussi les appels manuels à /_next/image sur les photographies
  // protégées : un cache d’optimisation survivrait à leur dépublication.
  images: { localPatterns: [{ pathname: "/images/**", search: "" }] },
};

export default nextConfig;

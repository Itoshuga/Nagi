"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import type { UniverseSlug } from "@/types/discoveries";
import { universeSlugs } from "@/types/discoveries";
import { universeDetails } from "@/data/universes";
import { destinationExplorationPath } from "@/lib/universe-navigation";

interface Props { contexts: readonly { key: string; name: string; path: string; hasDistricts: boolean }[]; universe: UniverseSlug; universeName: string; fallbackId?: string; compact?: boolean }

function ReturnContent({ contexts, universe, universeName, fallbackId, origin, compact = false }: Props & { origin?: string | null }) {
  const context = contexts.find((item) => item.key === origin) ?? contexts.find((item) => item.key === fallbackId);
  const label = context ? `Revenir à ${universeName} · ${context.name}` : "Explorer les destinations";
  return <div className={`reading-return section-shell${compact ? " reading-return-compact" : ""}`}><Link href={context ? destinationExplorationPath(context, universe) : "/destinations"}><ArrowLeft size={17} strokeWidth={1.5} aria-hidden="true" /><span>{label}</span></Link>{!compact && context && <Link href={context.path}>La destination · {context.name}</Link>}</div>;
}

function SelectedReturn(props: Props) {
  const params = useSearchParams();
  const origin = params.get("depuis");
  const originalUniverse = props.contexts.some((context) => context.key === origin) ? universeSlugs.find((slug) => slug === params.get("univers")) : undefined;
  return <ReturnContent {...props} universe={originalUniverse ?? props.universe} universeName={originalUniverse ? universeDetails[originalUniverse].name : props.universeName} origin={origin} />;
}

export function ContextReturn(props: Props) {
  return <Suspense fallback={<ReturnContent {...props} />}><SelectedReturn {...props} /></Suspense>;
}

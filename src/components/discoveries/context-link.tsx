"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { universeSlugs } from "@/types/discoveries";

type Props = { href: string; children: React.ReactNode; className?: string; ariaLabel?: string; allowedContexts: readonly string[] };

function PreservedLink({ href, children, className, ariaLabel, allowedContexts }: Props) {
  const params = useSearchParams();
  const origin = params.get("depuis");
  const universe = params.get("univers");
  const originalUniverse = universeSlugs.find((slug) => slug === universe);
  const target = origin && allowedContexts.includes(origin) ? `${href}?depuis=${encodeURIComponent(origin)}${originalUniverse ? `&univers=${originalUniverse}` : ""}` : href;
  return <Link href={target} className={className} aria-label={ariaLabel}>{children}</Link>;
}

export function ContextLink(props: Props) {
  return <Suspense fallback={<Link href={props.href} className={props.className} aria-label={props.ariaLabel}>{props.children}</Link>}><PreservedLink {...props} /></Suspense>;
}

import { getPublicGeography } from "./geography/public";
import { visibleDiscoveryCatalogue } from "./discoveries";
import { notFound } from "next/navigation";
import { getDiscoveryBySlug, isUniverse } from "./discoveries";

export function requireUniverse(value: string) {
  if (!isUniverse(value)) notFound();
  return value;
}

export async function requireDiscovery(universe: string, slug: string) {
  const content = getDiscoveryBySlug(requireUniverse(universe), slug, visibleDiscoveryCatalogue(await getPublicGeography()));
  if (!content) notFound();
  return content;
}

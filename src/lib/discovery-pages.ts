import { notFound } from "next/navigation";
import { getDiscoveryBySlug, isUniverse } from "./discoveries";

export function requireUniverse(value: string) {
  if (!isUniverse(value)) notFound();
  return value;
}

export function requireDiscovery(universe: string, slug: string) {
  const content = getDiscoveryBySlug(requireUniverse(universe), slug);
  if (!content) notFound();
  return content;
}

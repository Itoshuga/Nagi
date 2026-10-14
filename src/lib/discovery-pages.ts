import { getPublicContent } from "./contents/public";
import { notFound } from "next/navigation";
import { isUniverse } from "./discoveries";

export function requireUniverse(value: string) {
  if (!isUniverse(value)) notFound();
  return value;
}

export async function requireDiscovery(universe: string, slug: string) {
  const content = await getPublicContent(requireUniverse(universe), slug);
  if (!content) notFound();
  return content;
}

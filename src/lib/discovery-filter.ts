import type { DiscoveryCardData } from "../types/discoveries";

export function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").replace(/[’'‐‑–—-]/g, " ").replace(/\s+/g, " ").trim();
}

export function filterDiscoveryCards<T extends Pick<DiscoveryCardData, "title" | "summary" | "tags" | "typeLabel" | "locationLabel">>(items: readonly T[], query: string, tag: string): T[] {
  const terms = normalizeSearch(query).split(" ").filter(Boolean);
  return items.filter((item) => (tag === "" || item.tags.includes(tag)) && terms.every((term) => normalizeSearch([item.title, item.summary, item.typeLabel, item.locationLabel, ...item.tags].join(" ")).includes(term)));
}

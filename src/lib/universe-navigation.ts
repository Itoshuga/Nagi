import { universeSlugs, type UniverseSlug } from "../types/discoveries";

export function selectedUniverse(value: string | readonly string[] | null | undefined): UniverseSlug {
  const candidate = Array.isArray(value) ? (value.length === 1 ? value[0] : undefined) : value;
  return universeSlugs.find((slug) => slug === candidate) ?? "tourisme";
}

export function destinationTabPath(path: string, universe: UniverseSlug): string {
  return `${path}?onglet=${universe}#univers`;
}

export function destinationExplorationPath(destination: { path: string; hasDistricts: boolean }, universe: UniverseSlug): string {
  return destinationTabPath(destination.path, universe);
}

export function changedTabPath(path: string, search: string, universe: UniverseSlug, hash: string): string {
  const params = new URLSearchParams(search);
  params.set("onglet", universe);
  return `${path}?${params.toString()}${hash}`;
}

export function keyboardUniverse(current: UniverseSlug, key: string): UniverseSlug | undefined {
  const index = universeSlugs.indexOf(current);
  if (key === "ArrowRight") return universeSlugs[(index + 1) % universeSlugs.length];
  if (key === "ArrowLeft") return universeSlugs[(index + universeSlugs.length - 1) % universeSlugs.length];
  if (key === "Home") return universeSlugs[0];
  if (key === "End") return universeSlugs[universeSlugs.length - 1];
  return undefined;
}

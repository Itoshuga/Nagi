import { countries, cities, districts } from "./geography";
import type { Photograph } from "../types/content";

// Références déjà présentes dans Nagi ; aucun téléversement ni URL distante.
const photos = [...countries, ...cities, ...districts].flatMap((place) => [place.photograph,
  ...("discoveryPhotograph" in place && place.discoveryPhotograph ? [place.discoveryPhotograph] : []),
  ...("featurePhotograph" in place && place.featurePhotograph ? [place.featurePhotograph] : []),
].filter((photo): photo is Photograph => Boolean(photo)));
export const geographicCovers: readonly Photograph[] = [...new Map(photos.map((photo) => [photo.src, photo])).values()];
export function geographicCover(src: string) { return geographicCovers.find((photo) => photo.src === src) ?? null; }

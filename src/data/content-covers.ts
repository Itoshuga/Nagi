import { geographicCovers } from "./geographic-covers";
import { discoveryPhotographs } from "./discovery-photographs";
import { discoveries } from "./discoveries";
import type { Photograph } from "../types/content";

export const contentCovers: readonly Photograph[] = [...new Map([...geographicCovers, ...Object.values(discoveryPhotographs), ...discoveries.flatMap((item) => [...(item.photograph ? [item.photograph] : []), ...(item.gallery ?? [])])].map((photo) => [photo.src, photo])).values()];
export const contentCover = (src: string) => contentCovers.find((photo) => photo.src === src);

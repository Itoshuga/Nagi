import { destinationPhotographs } from "./destination-photographs";
import { discoveryPhotographs } from "./discovery-photographs";
import type { Photograph } from "../../src/types/content";

// Métadonnées de licence de l’ancien carnet, utilisées seulement à l’import.
export function importedPhotoCredit(src: string): Photograph["credit"] | null {
  const discovery = Object.values(discoveryPhotographs).find((photo) => photo.src === src);
  if (discovery) return { author: discovery.author, sourceUrl: discovery.sourceUrl, license: discovery.license, licenseUrl: discovery.licenseUrl, ...("creditTitle" in discovery ? { title: discovery.creditTitle } : {}) };
  const destination = Object.values(destinationPhotographs).find((photo) => photo.src === src);
  const legacy: Record<string, { author: string; sourceUrl: string }> = {
    "/images/kyoto-hero.jpg": { author: "PJH", sourceUrl: "https://unsplash.com/photos/a-japanese-garden-seen-through-a-sliding-door-toftUrCCSQs" },
    "/images/kyoto-garden.jpg": { author: "PJH", sourceUrl: "https://unsplash.com/photos/japanese-garden-with-lush-greenery-s0R5z-vh_74" },
    "/images/tokyo.jpg": { author: "TINYGLOBE", sourceUrl: "https://unsplash.com/photos/a-narrow-dark-alley-lit-up-at-night-4qQB7UYqz_A" },
    "/images/fujiyoshida.jpg": { author: "Sarmat Batagov", sourceUrl: "https://unsplash.com/photos/snow-capped-mountain-looms-over-a-japanese-street-UaYJFXPUtkQ" },
  };
  const item = destination ?? legacy[src];
  return item ? { author: item.author, sourceUrl: item.sourceUrl, license: "Licence Unsplash", licenseUrl: "https://unsplash.com/license" } : null;
}
export function importedPhotograph(photo: Photograph) {
  const credit = importedPhotoCredit(photo.src);
  return { ...photo, ...(credit ? { credit } : {}) };
}

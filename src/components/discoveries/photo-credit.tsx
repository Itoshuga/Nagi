import { discoveryPhotographs, type DiscoveryPhotograph } from "@/data/discovery-photographs";
import { destinationPhotographs } from "@/data/destination-photographs";

export function PhotoCredit({ src }: { src?: string }) {
  const photo: DiscoveryPhotograph | undefined = Object.values(discoveryPhotographs).find((item) => item.src === src);
  if (photo) return <span className="photo-attribution">Photo : <a href={photo.sourceUrl}>{photo.creditTitle ? `${photo.creditTitle} — ` : ""}{photo.author}</a> · <a href={photo.licenseUrl}>{photo.license}</a> · Redimensionnement et recadrage d’affichage</span>;
  const destination = Object.values(destinationPhotographs).find((item) => item.src === src);
  if (destination) return <span className="photo-attribution">Photo : <a href={destination.sourceUrl}>{destination.author}</a> · <a href="https://unsplash.com/license">Licence Unsplash</a></span>;
  if (src === "/images/fujiyoshida.jpg") return <span className="photo-attribution">Photo : <a href="https://unsplash.com/photos/snow-capped-mountain-looms-over-a-japanese-street-UaYJFXPUtkQ">Sarmat Batagov</a> · <a href="https://unsplash.com/license">Licence Unsplash</a></span>;
  return null;
}

export interface Photograph {
  credit?: { author: string; sourceUrl: string; license?: string; licenseUrl?: string; title?: string };
  author?: string;
  sourceUrl?: string;
  src: string;
  alt: string;
  position: string;
  width?: number;
  height?: number;
}

export interface Universe {
  slug: "tourisme" | "activites" | "gastronomie" | "adresses";
  name: string;
  subtitle: string;
  description: string;
  icon: "landmark" | "hand" | "bowl" | "coffee";
}

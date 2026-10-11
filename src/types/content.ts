export interface Photograph {
  src: string;
  alt: string;
  position: string;
}

export interface Universe {
  slug: "tourisme" | "activites" | "gastronomie" | "adresses";
  name: string;
  subtitle: string;
  description: string;
  icon: "landmark" | "hand" | "bowl" | "coffee";
}

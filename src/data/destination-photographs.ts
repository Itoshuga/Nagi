import type { Photograph } from "../types/content";

interface DestinationPhotograph extends Photograph {
  id: string;
  author: string;
  sourceUrl: string;
  width: number;
  height: number;
}

export const destinationPhotographs = {
  "osaka": {
    "id": "osaka",
    "author": "Redd Francisco",
    "sourceUrl": "https://unsplash.com/photos/river-in-between-street-and-high-rise-buildings-peYW3VwICpE",
    "src": "/images/osaka.jpg",
    "alt": "Le canal Dōtonbori à Osaka, ses quais et un bateau jaune",
    "width": 1600,
    "height": 1000,
    "position": "50% 52%"
  },
  "shinjuku": {
    "id": "shinjuku",
    "author": "Manuel Cosentino",
    "sourceUrl": "https://unsplash.com/photos/shinjuku-tokyo-japan-d92I1Of2ofQ",
    "src": "/images/shinjuku.jpg",
    "alt": "La porte lumineuse de Kabukichō à Shinjuku, Tokyo",
    "width": 1600,
    "height": 1067,
    "position": "50% 46%"
  },
  "ueno": {
    "id": "ueno",
    "author": "Redd Francisco",
    "sourceUrl": "https://unsplash.com/photos/persons-on-boat-iHU3ic36yeY",
    "src": "/images/ueno.jpg",
    "alt": "Des pédalos sur un étang du parc Ueno sous les cerisiers en fleurs",
    "width": 1600,
    "height": 1000,
    "position": "50% 48%"
  },
  "asakusa": {
    "id": "asakusa",
    "author": "Chayut Sritippho",
    "sourceUrl": "https://unsplash.com/photos/snow-falls-on-a-japanese-temple-Bb-0noTSaa4",
    "src": "/images/asakusa.jpg",
    "alt": "La façade du temple Sensō-ji à Asakusa pendant une chute de neige",
    "width": 1600,
    "height": 1084,
    "position": "50% 54%"
  },
  "shibuya": {
    "id": "shibuya",
    "author": "Stefan Szankowski",
    "sourceUrl": "https://unsplash.com/photos/shibuya-crossing-intersection-in-tokyo-hxljyb0f47M",
    "src": "/images/shibuya.jpg",
    "alt": "Vue aérienne des passages piétons du carrefour de Shibuya à Tokyo",
    "width": 1600,
    "height": 1068,
    "position": "50% 59%"
  },
  "ginza": {
    "id": "ginza",
    "author": "Fumiaki Hayashi",
    "sourceUrl": "https://unsplash.com/photos/a-person-walks-down-a-street-between-modern-glass-buildings-HGqx7I-FIwE",
    "src": "/images/ginza.jpg",
    "alt": "Une passante devant la façade de verre de la Maison Hermès à Ginza",
    "width": 1600,
    "height": 1000,
    "position": "50% 39%"
  }
} as const satisfies Record<string, DestinationPhotograph>;

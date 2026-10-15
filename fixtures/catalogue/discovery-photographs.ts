import type { Photograph } from "../../src/types/content";

export interface DiscoveryPhotograph extends Photograph {
  creditTitle?: string;
  author: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
  width: number;
  height: number;
}

// Locations are identified by the source. Activity photographs illustrate
// the practice or its objects, not a bookable venue or a particular workshop.
export const discoveryPhotographs = {
  "sensoJi": {
    "src": "/images/asakusa.jpg",
    "alt": "La façade du temple Sensō-ji à Asakusa pendant une chute de neige",
    "position": "50% 54%",
    "author": "Chayut Sritippho",
    "sourceUrl": "https://unsplash.com/photos/snow-falls-on-a-japanese-temple-Bb-0noTSaa4",
    "license": "Unsplash License",
    "licenseUrl": "https://unsplash.com/license",
    "width": 1600,
    "height": 1084
  },
  "uenoPark": {
    "src": "/images/ueno.jpg",
    "alt": "Des pédalos sur un étang du parc Ueno sous les cerisiers en fleurs",
    "position": "50% 48%",
    "author": "Redd Francisco",
    "sourceUrl": "https://unsplash.com/photos/persons-on-boat-iHU3ic36yeY",
    "license": "Unsplash License",
    "licenseUrl": "https://unsplash.com/license",
    "width": 1600,
    "height": 1000
  },
  "kaminarimon": {
    "src": "/images/discoveries/kaminarimon.jpg",
    "alt": "La porte Kaminarimon et sa grande lanterne rouge à Asakusa",
    "position": "50% 50%",
    "author": "yomogi",
    "sourceUrl": "https://unsplash.com/photos/a-group-of-people-walking-across-a-street-in-front-of-a-building-euGlQk91y9I",
    "license": "Unsplash License",
    "licenseUrl": "https://unsplash.com/license",
    "width": 1400,
    "height": 934
  },
  "shinjukuGyoen": {
    "src": "/images/discoveries/shinjukuGyoen.jpg",
    "alt": "Un pin et une lanterne de pierre au bord d’un étang de Shinjuku Gyoen",
    "position": "50% 75%",
    "author": "Shpëtim Ujkani",
    "sourceUrl": "https://unsplash.com/photos/a-pagoda-in-the-middle-of-a-pond-surrounded-by-trees-r0X9MwYmLBc",
    "license": "Unsplash License",
    "licenseUrl": "https://unsplash.com/license",
    "width": 1201,
    "height": 1600
  },
  "fushimiInari": {
    "src": "/images/discoveries/fushimiInari.jpg",
    "alt": "Une allée de torii orange au sanctuaire Fushimi Inari de Kyoto",
    "position": "50% 50%",
    "author": "Stefano Bucciarelli",
    "sourceUrl": "https://unsplash.com/photos/thousands-of-vibrant-orange-torii-gates-at-fushimi-inari-shrine-Vu9O6DRGXQU",
    "license": "Unsplash License",
    "licenseUrl": "https://unsplash.com/license",
    "width": 1400,
    "height": 935
  },
  "tonkatsu": {
    "src": "/images/discoveries/tonkatsu.jpg",
    "alt": "Un tonkatsu doré accompagné de chou émincé et de petits plats",
    "position": "50% 65%",
    "author": "charlesdeluvio",
    "sourceUrl": "https://unsplash.com/photos/cooked-food-BYgDxSJBqJw",
    "license": "Unsplash License",
    "licenseUrl": "https://unsplash.com/license",
    "width": 1067,
    "height": 1600
  },
  "taiyaki": {
    "src": "/images/discoveries/taiyaki.jpg",
    "alt": "Un taiyaki en forme de poisson posé sur une assiette noire",
    "position": "50% 55%",
    "author": "Kumiko SHIMIZU",
    "sourceUrl": "https://unsplash.com/photos/a-black-plate-topped-with-a-cut-in-half-sandwich-_ualFWI3D9s",
    "license": "Unsplash License",
    "licenseUrl": "https://unsplash.com/license",
    "width": 1400,
    "height": 933
  },
  "dorayaki": {
    "src": "/images/discoveries/dorayaki.jpg",
    "alt": "Trois dorayaki emballés posés sur du papier et une table en bois",
    "position": "50% 57%",
    "author": "Kouji Tsuru",
    "sourceUrl": "https://unsplash.com/photos/delicious-japanese-dorayaki-cakes-are-ready-to-eat-It_anZ1J_CQ",
    "license": "Unsplash License",
    "licenseUrl": "https://unsplash.com/license",
    "width": 1067,
    "height": 1600
  },
  "takoyaki": {
    "src": "/images/discoveries/takoyaki.jpg",
    "alt": "Des takoyaki garnis de sauce, de mayonnaise et de copeaux de bonite",
    "position": "50% 62%",
    "author": "sooji min",
    "sourceUrl": "https://unsplash.com/photos/takoyaki-a-popular-japanese-street-food-dish-O9keRareNeY",
    "license": "Unsplash License",
    "licenseUrl": "https://unsplash.com/license",
    "width": 1019,
    "height": 1600
  },
  "okonomiyaki": {
    "src": "/images/discoveries/okonomiyaki.jpg",
    "alt": "Des okonomiyaki dorés sur une plaque de cuisson en métal",
    "position": "50% 54%",
    "author": "Yosuke Ota",
    "sourceUrl": "https://unsplash.com/photos/okonomiyaki-cooking-on-a-hot-plate-IveJAkyk7q8",
    "license": "Unsplash License",
    "licenseUrl": "https://unsplash.com/license",
    "width": 1400,
    "height": 933
  },
  "tea": {
    "src": "/images/discoveries/tea.jpg",
    "alt": "Une bouilloire et les ustensiles d’une cérémonie du thé sur des tatamis",
    "position": "50% 54%",
    "author": "Fumiaki Hayashi",
    "sourceUrl": "https://unsplash.com/photos/traditional-japanese-tea-ceremony-setting-with-kettle-and-cups-EUqx6ACfXFA",
    "license": "Unsplash License",
    "licenseUrl": "https://unsplash.com/license",
    "width": 1400,
    "height": 933
  },
  "wagashi": {
    "src": "/images/discoveries/wagashi.jpg",
    "alt": "Quatre wagashi en forme de fleurs sur un plateau en bois",
    "position": "50% 52%",
    "author": "Vicky Ng",
    "sourceUrl": "https://unsplash.com/photos/purple-and-white-flower-bouquet-on-brown-round-table-Ayy_K-y_dLA",
    "license": "Unsplash License",
    "licenseUrl": "https://unsplash.com/license",
    "width": 1200,
    "height": 1600
  },
  "monjayaki": {
    "creditTitle": "Monjayaki on the teppan",
    "src": "/images/discoveries/monjayaki.jpg",
    "alt": "Un monjayaki en cours de cuisson sur une plaque teppan",
    "position": "50% 50%",
    "author": "Douglas P Perkins",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Monjayaki_on_the_teppan.jpg",
    "license": "CC BY 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/3.0/",
    "width": 1280,
    "height": 960
  },
  "craft": {
    "creditTitle": "Furoshiki, traditional japanese wrapping technique with cloths (1)",
    "src": "/images/discoveries/craft.jpg",
    "alt": "Trois objets emballés dans des tissus noués selon la technique du furoshiki",
    "position": "50% 60%",
    "author": "Culture Japon",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Furoshiki,_traditional_japanese_wrapping_technique_with_cloths_(1).jpg",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
    "width": 1280,
    "height": 721
  }
} as const satisfies Record<string, DiscoveryPhotograph>;

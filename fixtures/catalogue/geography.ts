import type { City, Country, District } from "../../src/types/destinations";
import { destinationPhotographs } from "./destination-photographs";

export const countries: readonly Country[] = [
  {
    id: "country-jp",
    name: "Japon",
    slug: "japon",
    region: "Asie de l’Est",
    mood: "À pas feutrés",
    description: "Des jardins de Kyoto aux ruelles de Tokyo, découvrir le Japon à travers ses villes, ses paysages et les petits détails du quotidien.",
    introduction: "Une fenêtre ouverte sur un jardin. La rumeur d’une rue, puis le silence. Le Japon se raconte dans ces contrastes, et dans le temps que l’on prend pour les observer.",
    photograph: { src: "/images/kyoto-hero.jpg", alt: "Un jardin japonais vu depuis un intérieur à tatamis à Kyoto", position: "50% 50%" },
    presentation: [
      { label: "Regard", value: "Entre villes et jardins" },
      { label: "Au fil du carnet", value: "Lieux, gestes et saveurs" },
      { label: "À votre rythme", value: "Une escale après l’autre" },
    ],
  },
];

export const cities: readonly City[] = [
  {
    id: "city-jp-tokyo",
    countryId: "country-jp",
    name: "Tokyo",
    slug: "tokyo",
    region: "Kantō",
    mood: "L’intime dans l’immense",
    description: "Quitter les grandes avenues. Suivre une ruelle, une lumière, le parfum d’un petit restaurant encore ouvert.",
    introduction: "Tokyo n’a pas une seule allure. Elle change au détour d’une gare, d’un parc, d’un passage étroit. Chaque quartier propose son rythme ; entre deux escales, la ville entière reste à découvrir.",
    caption: "Tokyo — Au détour d’une ruelle",
    photograph: { src: "/images/tokyo-alley.jpg", alt: "Une ruelle étroite de Tokyo bordée de petits restaurants et d’enseignes lumineuses", position: "50% 50%" },
    featurePhotograph: destinationPhotographs.shinjuku,
  },
  {
    id: "city-jp-kyoto",
    countryId: "country-jp",
    name: "Kyoto",
    slug: "kyoto",
    region: "Kansai",
    mood: "Le temps suspendu",
    description: "Un jardin derrière une porte, le bois patiné d’un temple. À Kyoto, la beauté se laisse approcher en silence.",
    introduction: "À Kyoto, il suffit parfois de s’asseoir. Laisser le regard suivre une branche, la lumière sur le bois, le dessin des pierres. Puis reprendre la marche, sans chercher à tout voir.",
    caption: "Kyoto — Une autre mesure du temps",
    photograph: { src: "/images/kyoto-hero.jpg", alt: "Un jardin japonais verdoyant contemplé depuis l’intérieur d’un temple à Kyoto", position: "58% 50%" },
    discoveryPhotograph: { src: "/images/kyoto-garden.jpg", alt: "Un pavillon de bois ouvert sur un jardin luxuriant à Kyoto", position: "50% 50%" },
  },
  {
    id: "city-jp-osaka",
    countryId: "country-jp",
    name: "Osaka",
    slug: "osaka",
    region: "Kansai",
    mood: "La ville à partager",
    description: "Des enseignes au bord de l’eau, des conversations autour d’un comptoir. Osaka se découvre aussi par l’appétit.",
    introduction: "Autour de Dōtonbori, les lumières se reflètent dans le canal et les rues invitent à s’attarder. Osaka a le goût des rencontres simples : un plat partagé, une promenade, une soirée qui se prolonge.",
    caption: "Osaka — La lumière au fil de l’eau",
    photograph: destinationPhotographs.osaka,
  },
  {
    id: "city-jp-fujiyoshida",
    countryId: "country-jp",
    name: "Fujiyoshida",
    slug: "fujiyoshida",
    region: "Yamanashi",
    mood: "À l’ombre du Fuji",
    description: "Au bout de la rue, une montagne. Le Fuji veille sur les maisons et donne aux gestes quotidiens un autre horizon.",
    introduction: "Ici, le regard finit souvent par rejoindre le Fuji. Mais la ville mérite aussi que l’on s’y arrête : ses rues, ses petits commerces, ses instants ordinaires composent un voyage à hauteur humaine.",
    caption: "Fujiyoshida — Le Fuji en perspective",
    photograph: { src: "/images/fujiyoshida.jpg", alt: "Le mont Fuji enneigé au bout d’une rue de Fujiyoshida, entre les maisons et les lignes électriques", position: "50% 45%" },
    featurePhotograph: { src: "/images/fujiyoshida.jpg", alt: "Le sommet enneigé du mont Fuji dans la perspective d’une rue de Fujiyoshida", position: "50% 18%" },
  },
];

export const districts: readonly District[] = [
  {
    id: "district-tokyo-shinjuku", cityId: "city-jp-tokyo", name: "Shinjuku", slug: "shinjuku",
    mood: "La nuit en mouvement",
    description: "Des enseignes lumineuses aux passages plus discrets, Shinjuku laisse cohabiter l’effervescence et les petits refuges.",
    introduction: "Lever les yeux vers les façades, puis les ramener à hauteur de comptoir. À Shinjuku, la ville semble ne jamais s’arrêter. Il suffit pourtant d’une ruelle pour changer de rythme.",
    photograph: destinationPhotographs.shinjuku,
  },
  {
    id: "district-tokyo-ueno", cityId: "city-jp-tokyo", name: "Ueno", slug: "ueno",
    mood: "Une respiration dans la ville",
    description: "Les allées d’un parc, une halte au musée, la vie des rues voisines. Ueno fait dialoguer la promenade et la curiosité.",
    introduction: "On vient à Ueno pour regarder, pour apprendre ou simplement pour marcher sous les arbres. Autour du parc et des musées, Tokyo prend une allure plus posée, sans perdre son énergie.",
    photograph: destinationPhotographs.ueno,
  },
  {
    id: "district-tokyo-asakusa", cityId: "city-jp-tokyo", name: "Asakusa", slug: "asakusa",
    mood: "Les échos d’un autre Tokyo",
    description: "Autour du Sensō-ji, lanternes, échoppes et gestes familiers dessinent un quartier à parcourir sans se presser.",
    introduction: "À Asakusa, les détails retiennent les pas : une façade de bois, un parfum de pâtisserie, une lanterne. Autour du temple, le quartier mêle les habitudes du quotidien à celles du voyage.",
    photograph: destinationPhotographs.asakusa,
  },
  {
    id: "district-tokyo-shibuya", cityId: "city-jp-tokyo", name: "Shibuya", slug: "shibuya",
    mood: "Au croisement des énergies",
    description: "Un carrefour en mouvement, des vitrines et des rues qui montent. Shibuya invite à suivre l’élan de la ville.",
    introduction: "Observer quelques instants le ballet du carrefour, puis s’en éloigner. Les rues de Shibuya ouvrent d’autres perspectives : une musique, un café, une façade qui accroche le regard.",
    photograph: destinationPhotographs.shibuya,
  },
  {
    id: "district-tokyo-ginza", cityId: "city-jp-tokyo", name: "Ginza", slug: "ginza",
    mood: "Le soin du détail",
    description: "Des lignes architecturales aux vitrines composées avec soin, Ginza propose une autre façon de regarder Tokyo.",
    introduction: "À Ginza, les grandes avenues invitent à lever les yeux. Puis une rue de côté, une galerie ou un salon de thé ramène à une échelle plus intime. L’élégance se glisse entre les deux.",
    photograph: destinationPhotographs.ginza,
  },
];

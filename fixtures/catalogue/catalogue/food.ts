import type { FoodDiscovery } from "../../../src/types/discoveries";
import { discoveryPhotographs as photos } from "../discovery-photographs";
import { publication, verificationDate } from "./common";

const tokyoFood = { label: "GO TOKYO — spécialités de Tokyo", url: "https://www.gotokyo.org/en/see-and-do/drinking-and-dining/tokyo-local-food/index.html" };
const japaneseSweets = { label: "Japan National Tourism Organization — douceurs japonaises", url: "https://www.japan.travel/en/blog/japanese-desserts-to-try/" };
const osakaFood = { label: "Osaka Convention & Tourism Bureau — gastronomie", url: "https://osaka-info.jp/en/discover-kansai/osaka-gourmet/" };

export const food: readonly FoodDiscovery[] = [
  {
    ...publication, id: "food-tonkatsu", universe: "gastronomie", slug: "tonkatsu", title: "Tonkatsu", originalName: "とんかつ", foodType: "Plat", photograph: photos.tonkatsu,
    summary: "Le contraste d’une panure légère et d’une pièce de porc, à découvrir bouchée après bouchée.",
    description: ["Le tonkatsu repose sur un contraste : une croûte croustillante autour d’une pièce de porc. Servie découpée, elle invite à apprécier la texture de la panure autant que celle de la viande.", "Le choix entre filet et longe change l’expérience. Le premier est généralement plus maigre ; la seconde laisse davantage de place au gras. Les accompagnements et la sauce varient selon les maisons."],
    origins: "Japon · cuisine japonaise d’inspiration occidentale", history: ["Le tonkatsu appartient au répertoire yōshoku, qui adapte des préparations d’inspiration occidentale au goût japonais. Les maisons spécialisées en ont fait une cuisine à part entière, attentive à la découpe et à la friture."],
    ingredients: ["Porc", "Chapelure panko", "Farine", "Œuf"], variants: ["Hire-katsu : filet", "Rosu-katsu : longe", "Katsu sando : déclinaison en sandwich"], tags: ["Salé", "Pané"],
    destinations: [{ kind: "city", id: "city-jp-tokyo" }, { kind: "district", id: "district-tokyo-shinjuku" }, { kind: "district", id: "district-tokyo-ginza" }], verifiedAt: verificationDate,
    sources: [{ label: "Ginza Bairin — le tonkatsu et ses variantes", url: "https://www.ginzabairin.com/en/index.php" }, { label: "Maisen — présentation de la spécialité", url: "https://www.maisen.com.my/" }],
  },
  {
    ...publication, id: "food-monjayaki", universe: "gastronomie", slug: "monjayaki", title: "Monjayaki", originalName: "もんじゃ焼き", foodType: "Plat", photograph: photos.monjayaki,
    summary: "Une préparation souple, une plaque chaude et le plaisir de partager autour du teppan.",
    description: ["La pâte du monjayaki est plus fluide que celle de l’okonomiyaki. Elle rencontre sur la plaque du chou finement coupé et des garnitures variables, pour une préparation dont la texture fait toute la singularité.", "On le découvre en prenant son temps, autour de la cuisson. Le bord qui dore, le centre encore tendre et les petites portions composent une expérience autant collective que gourmande."],
    origins: "Tokyo", history: ["Associé à la cuisine populaire de Tokyo, le monjayaki est particulièrement présent dans le quartier de Tsukishima. On le retrouve aussi à d’autres tables de la capitale, notamment à Asakusa."],
    ingredients: ["Farine", "Eau ou bouillon", "Chou", "Garnitures selon la recette"], variants: ["Garnitures de légumes", "Versions aux produits de la mer", "Mélanges propres à chaque maison"], tags: ["Salé", "Teppan", "À partager"],
    destinations: [{ kind: "city", id: "city-jp-tokyo" }, { kind: "district", id: "district-tokyo-asakusa" }], verifiedAt: verificationDate, sources: [tokyoFood],
  },
  {
    ...publication, id: "food-taiyaki", universe: "gastronomie", slug: "taiyaki", title: "Taiyaki", originalName: "たい焼き", foodType: "Pâtisserie", photograph: photos.taiyaki,
    summary: "Un poisson doré, une pâte moelleuse et un cœur traditionnellement garni d’azuki.",
    description: ["Le taiyaki doit sa silhouette au moule dans lequel sa pâte cuit. Le poisson est un dessin : la pâtisserie ne contient pas de poisson. Sa garniture traditionnelle est une pâte sucrée de haricots azuki, l’anko.", "La rencontre entre la surface dorée et le cœur tendre fait son charme. Selon les préparations, la pâte peut être plus fine ou plus généreuse ; les garnitures contemporaines multiplient les variations."],
    origins: "Japon", history: ["Cette pâtisserie moulée fait partie des douceurs populaires japonaises. Sa forme permet de la reconnaître immédiatement, tout en laissant à chaque fabricant sa manière de travailler la pâte et la garniture."],
    ingredients: ["Pâte à base de farine", "Garniture d’azuki pour la version classique"], variants: ["Anko", "Crème pâtissière selon les maisons"], tags: ["Sucré", "Azuki"],
    destinations: [{ kind: "city", id: "city-jp-tokyo" }, { kind: "district", id: "district-tokyo-shinjuku" }], verifiedAt: verificationDate, sources: [japaneseSweets],
  },
  {
    ...publication, id: "food-dorayaki", universe: "gastronomie", slug: "dorayaki", title: "Dorayaki", originalName: "どら焼き", foodType: "Pâtisserie", photograph: photos.dorayaki,
    summary: "Deux disques de pâte dorée entourent une garniture d’anko, dans un équilibre tout en douceur.",
    description: ["Le dorayaki se reconnaît à ses deux petites pièces de pâte, proches d’un pancake, réunies autour d’une garniture. L’anko donne à sa version classique sa saveur et sa texture.", "La dégustation tient dans des détails : le moelleux, la couleur de la pâte, la présence plus ou moins marquée des haricots dans la garniture. Une forme simple qui laisse beaucoup de place au savoir-faire."],
    origins: "Japon", history: ["Le dorayaki figure parmi les douceurs japonaises familières. Il appartient au monde des pâtisseries à l’azuki, dont les préparations jouent sur des textures et des formes très différentes."],
    ingredients: ["Farine", "Œuf", "Sucre", "Pâte de haricots azuki"], variants: ["Anko plus ou moins lisse", "Garnitures à la crème selon les maisons"], tags: ["Sucré", "Azuki"],
    destinations: [{ kind: "city", id: "city-jp-tokyo" }, { kind: "district", id: "district-tokyo-asakusa" }, { kind: "district", id: "district-tokyo-ueno" }], verifiedAt: verificationDate, sources: [japaneseSweets],
  },
  {
    ...publication, id: "food-takoyaki", universe: "gastronomie", slug: "takoyaki", title: "Takoyaki", originalName: "たこ焼き", foodType: "Plat", photograph: photos.takoyaki,
    summary: "Des bouchées rondes au poulpe, façonnées dans la chaleur d’une plaque à alvéoles.",
    description: ["Le geste fait partie du spectacle : la pâte est retournée dans son alvéole jusqu’à former une sphère. À l’intérieur se trouve un morceau de poulpe, qui donne son nom au takoyaki.", "Cette spécialité d’Osaka se reconnaît à sa pâte et à ses garnitures. Sauce, algue ou bonite peuvent compléter la préparation selon la maison. Le cœur conserve longtemps la chaleur de la cuisson."],
    origins: "Osaka", history: ["Les takoyaki occupent une place particulière dans l’imaginaire gourmand d’Osaka. Ils illustrent le goût local pour les préparations à base de farine, les cuissons visibles et les formats à partager."],
    ingredients: ["Pâte à base de farine et de bouillon", "Poulpe", "Garnitures et sauce selon la recette"], variants: ["Version nappée de sauce", "Assaisonnements propres à chaque maison"], tags: ["Salé", "À partager", "Cuisine d’Osaka"],
    destinations: [{ kind: "city", id: "city-jp-osaka" }], verifiedAt: verificationDate, sources: [osakaFood],
  },
  {
    ...publication, id: "food-okonomiyaki", universe: "gastronomie", slug: "okonomiyaki", title: "Okonomiyaki", originalName: "お好み焼き", foodType: "Plat", photograph: photos.okonomiyaki,
    summary: "Une préparation garnie, cuite sur une plaque chaude, qui raconte le goût de chaque table.",
    description: ["Chou, pâte et garnitures se réunissent sur le teppan. L’okonomiyaki se découvre à la fois par la texture de sa préparation et par les saveurs qui l’accompagnent.", "Viande, produits de la mer et autres garnitures donnent lieu à des recettes variées. La forme familière ne doit pas faire oublier cette diversité : elle change selon les régions et selon les maisons."],
    origins: "Japon · particulièrement associé à Osaka et Hiroshima", history: ["L’okonomiyaki appartient aux cuisines populaires de la plaque. À Osaka comme ailleurs, la préparation a donné naissance à des spécialités de maisons et à des variations régionales."],
    ingredients: ["Chou", "Farine", "Œuf selon la recette", "Viande ou produits de la mer selon la garniture"], variants: ["Style d’Osaka", "Style d’Hiroshima", "Garnitures de chaque établissement"], tags: ["Salé", "Teppan", "À partager"],
    destinations: [{ kind: "city", id: "city-jp-osaka" }, { kind: "district", id: "district-tokyo-asakusa" }], verifiedAt: verificationDate, sources: [osakaFood, { label: "Kamiya — carte officielle", url: "https://kamiya-kaminarimon-monja.com/menu/" }],
  },
];

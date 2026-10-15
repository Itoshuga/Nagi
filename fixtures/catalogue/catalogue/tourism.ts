import type { TourismDiscovery } from "../../../src/types/discoveries";
import { discoveryPhotographs as photos } from "../discovery-photographs";
import { publication, verificationDate } from "./common";

export const tourism: readonly TourismDiscovery[] = [
  {
    ...publication, id: "place-sensoji", universe: "tourisme", slug: "senso-ji", title: "Sensō-ji", placeType: "Temple bouddhiste",
    location: { kind: "district", id: "district-tokyo-asakusa" }, photograph: photos.sensoJi, tags: ["Culturel", "Historique"],
    gallery: [{ ...photos.kaminarimon, caption: "Kaminarimon marque l’entrée de l’ensemble du Sensō-ji." }],
    summary: "Au cœur d’Asakusa, un temple où la vie du quartier rencontre les gestes du culte.",
    description: ["On approche Sensō-ji par une succession de seuils : la porte, la rue commerçante, puis la cour. Le mouvement de la foule accompagne celui des fidèles. Prendre un peu de recul permet de retrouver la composition de l’ensemble.", "Le temple est consacré à Kannon, figure bouddhiste de compassion. Selon la tradition du lieu, son histoire commence en 628, lorsque deux pêcheurs découvrent une statue dans la Sumida. Cette histoire continue de donner son sens à la visite.", "Sensō-ji est un lieu de culte vivant. Observer les indications sur place et laisser de l’espace aux personnes venues prier fait aussi partie de la découverte."],
    address: "2-3-1 Asakusa, Taitō-ku, Tokyo 111-0032, Japon", officialUrl: "https://www.senso-ji.jp/english/", verifiedAt: verificationDate,
    sources: [{ label: "Sensō-ji — histoire et présentation officielles", url: "https://www.senso-ji.jp/english/" }],
  },
  {
    ...publication, id: "place-kaminarimon", universe: "tourisme", slug: "kaminarimon", title: "Kaminarimon", placeType: "Porte monumentale",
    location: { kind: "district", id: "district-tokyo-asakusa" }, photograph: photos.kaminarimon, tags: ["Culturel", "Historique", "Photographique"],
    summary: "Une lanterne rouge, deux gardiens, et le seuil d’un autre rythme à Asakusa.",
    description: ["La porte du Tonnerre marque l’entrée du Sensō-ji. Les divinités du vent et du tonnerre encadrent son passage ; la grande lanterne donne à l’ensemble sa silhouette immédiatement reconnaissable.", "La porte visible aujourd’hui date de 1960. Elle prolonge une histoire plus ancienne, interrompue notamment par l’incendie qui détruisit la précédente au XIXe siècle.", "Au-delà de l’image familière, regardez le bois, les proportions et le passage des visiteurs. Puis poursuivez vers le temple en laissant le seuil libre pour celles et ceux qui le traversent."],
    address: "Entrée du Sensō-ji, Asakusa, Tokyo, Japon", officialUrl: "https://www.senso-ji.jp/guide/guide01.html", verifiedAt: verificationDate,
    sources: [{ label: "Sensō-ji — Kaminarimon", url: "https://www.senso-ji.jp/guide/guide01.html" }],
  },
  {
    ...publication, id: "place-ueno-park", universe: "tourisme", slug: "parc-ueno", title: "Parc d’Ueno", placeType: "Parc urbain",
    location: { kind: "district", id: "district-tokyo-ueno" }, photograph: photos.uenoPark, tags: ["Naturel", "Culturel", "Photographique"],
    summary: "Des allées, des musées et un étang : une respiration au milieu de Tokyo.",
    description: ["Le parc d’Ueno se découvre par fragments. Une allée ombragée mène vers un musée, une pente ouvre la perspective sur Shinobazu. Le paysage relie la promenade à la curiosité culturelle.", "Les saisons transforment le regard : les cerisiers, les lotus de l’étang, puis les feuillages composent des scènes différentes. Aucune visite ne ressemble exactement à la précédente.", "Il n’est pas nécessaire d’en faire le tour pour en saisir l’atmosphère. Choisir un point de vue et s’y attarder suffit parfois à changer la manière de voir la ville."],
    address: "Uenokōen et Ikenohata, Taitō-ku, Tokyo, Japon", officialUrl: "https://www.kensetsu.metro.tokyo.lg.jp/jimusho/toubuk/ueno/", verifiedAt: verificationDate,
    sources: [{ label: "Gouvernement métropolitain de Tokyo — parc d’Ueno", url: "https://www.kensetsu.metro.tokyo.lg.jp/jimusho/toubuk/ueno/" }],
  },
  {
    ...publication, id: "place-shinjuku-gyoen", universe: "tourisme", slug: "shinjuku-gyoen", title: "Shinjuku Gyoen", placeType: "Jardin national",
    location: { kind: "district", id: "district-tokyo-shinjuku" }, photograph: photos.shinjukuGyoen, tags: ["Naturel", "Historique", "Photographique"],
    summary: "Au-delà des avenues, plusieurs traditions du jardin se répondent dans un même paysage.",
    description: ["À Shinjuku Gyoen, les grandes pelouses, les compositions régulières et le jardin japonais ne proposent pas le même regard. Passer de l’un à l’autre permet de sentir comment les formes organisent la promenade.", "Ancien domaine de la famille Naitō, puis jardin impérial, le lieu s’est ouvert au public en 1949. Son histoire se lit autant dans les tracés que dans les arbres.", "Les conditions d’entrée et d’accès peuvent évoluer selon la saison. Le site officiel reste le point de référence pour préparer une visite."],
    address: "11 Naitōmachi, Shinjuku-ku, Tokyo 160-0014, Japon", officialUrl: "https://policies.env.go.jp/national-garden/shinjukugyoen/english/intro/", verifiedAt: verificationDate,
    sources: [{ label: "Ministère de l’Environnement — Shinjuku Gyoen", url: "https://policies.env.go.jp/national-garden/shinjukugyoen/english/intro/" }, { label: "Histoire du jardin", url: "https://policies.env.go.jp/national-garden/shinjukugyoen/english/intro/history/" }],
  },
  {
    ...publication, id: "place-fushimi-inari", universe: "tourisme", slug: "fushimi-inari-taisha", title: "Fushimi Inari-taisha", placeType: "Sanctuaire shinto",
    location: { kind: "city", id: "city-jp-kyoto" }, photograph: photos.fushimiInari, tags: ["Culturel", "Historique", "Naturel"],
    summary: "Des torii vermillon accompagnent les pas sur les pentes du mont Inari.",
    description: ["Fushimi Inari-taisha est un sanctuaire shinto dédié à Inari. Son histoire situe son établissement en 711 ; le site s’étend depuis les bâtiments au pied de la montagne vers les chemins du mont Inari.", "Les torii sont des offrandes. Leur succession forme un paysage à la fois architectural et spirituel, dont les inscriptions rappellent la présence des donateurs.", "Le lieu invite à regarder au-delà de la perspective célèbre : la pierre, la forêt et les espaces de prière composent aussi la visite. Chacun peut adapter sa marche au temps dont il dispose."],
    address: "68 Fukakusa Yabunouchi-chō, Fushimi-ku, Kyoto 612-0882, Japon", officialUrl: "https://inari.jp/en/", verifiedAt: verificationDate,
    sources: [{ label: "Fushimi Inari-taisha — histoire", url: "https://inari.jp/en/history/" }, { label: "Le chemin des torii", url: "https://inari.jp/en/map/spot_07/" }],
  },
  {
    ...publication, id: "place-honcho", universe: "tourisme", slug: "honcho-dori", title: "Honchō-dōri", placeType: "Rue et perspective",
    location: { kind: "city", id: "city-jp-fujiyoshida" }, photograph: { src: "/images/fujiyoshida.jpg", alt: "Le mont Fuji dans la perspective d’une rue de Fujiyoshida", position: "50% 18%" }, tags: ["Photographique", "Urbain"],
    summary: "Une rue habitée, des enseignes, et le Fuji qui donne sa profondeur au paysage.",
    description: ["La perspective de Honchō-dōri réunit deux échelles : celle des commerces et des maisons, puis celle du mont Fuji à l’horizon. La montagne apparaît ici dans le cadre de la vie quotidienne.", "Cette rue reste un lieu de circulation et de travail. Le meilleur point de vue est aussi celui qui laisse le trottoir libre et respecte les riverains. La visibilité de la montagne dépend des conditions du jour."],
    address: "Shimoyoshida, Fujiyoshida, Yamanashi, Japon", access: "Observer et photographier depuis les trottoirs, sans gêner les riverains ni la circulation.", officialUrl: "https://www.city.fujiyoshida.yamanashi.jp/page/1338.html", verifiedAt: verificationDate, sources: [{ label: "Ville de Fujiyoshida — Honcho Street", url: "https://www.city.fujiyoshida.yamanashi.jp/page/1338.html" }],
  },
];

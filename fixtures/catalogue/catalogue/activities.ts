import type { ActivityDiscovery } from "../../../src/types/discoveries";
import { discoveryPhotographs as photos } from "../discovery-photographs";
import { publication } from "./common";

export const activities: readonly ActivityDiscovery[] = [
  {
    ...publication, id: "activity-tea", universe: "activites", slug: "ceremonie-du-the", title: "Autour de la cérémonie du thé", activityType: "Pratique culturelle", format: "editorial-idea",
    location: { kind: "city", id: "city-jp-kyoto" }, photograph: photos.tea, photographCaption: "Une évocation de la pratique du thé ; aucun établissement n’est représenté.", tags: ["Culturel", "Gestes", "Thé"],
    summary: "Regarder la préparation du matcha comme un moment d’attention, de gestes et d’hospitalité.",
    description: ["Un ustensile posé, un mouvement mesuré, la place donnée à l’invité. La cérémonie du thé invite à observer des détails que le quotidien rend parfois invisibles.", "Cette page propose une piste culturelle pour un séjour à Kyoto. Elle ne décrit pas une séance programmée : les formes d’accueil et de participation varient selon les lieux et les écoles."],
    experience: "Avant de choisir une initiation, découvrir le rôle du bol, du fouet et des gestes de préparation. Prendre le temps d’écouter les explications de la personne qui accueille permet d’approcher le sens de la pratique.",
    additionalInformation: "Aucun prestataire, créneau ou tarif n’est sélectionné dans ce carnet. Renseignez-vous auprès du lieu choisi pour connaître son format et ses conditions.",
    sources: [{ label: "JNTO — la cérémonie du thé", url: "https://www.japan.travel/en/guide/tea-ceremony/" }],
  },
  {
    ...publication, id: "activity-wagashi", universe: "activites", slug: "atelier-wagashi", title: "Façonner des wagashi", activityType: "Art culinaire", format: "editorial-idea",
    location: { kind: "district", id: "district-tokyo-asakusa" }, photograph: photos.wagashi, photographCaption: "Wagashi photographiés pour illustrer le savoir-faire, sans lien avec un atelier commercial.", tags: ["Culturel", "Gestes", "Sucré"],
    summary: "Des formes, des couleurs et des saisons réunies dans une petite douceur.",
    description: ["Les wagashi donnent une forme comestible à des détails de la nature. Pétales, feuilles ou évocations de l’eau deviennent des points de départ pour le regard et pour la main.", "Imaginer une initiation à leur confection, c’est aussi apprendre à voir la précision d’un pli, la proportion d’une pièce et l’accord des couleurs. La patience compte autant que le résultat."],
    experience: "Observer une pièce, comprendre sa forme puis découvrir les gestes qui la composent : une piste d’initiation à rechercher pendant une exploration d’Asakusa. Aucun atelier précis n’est référencé ici.",
    additionalInformation: "Idée d’expérience à organiser auprès d’un intervenant identifié. Les ingrédients et les conditions de participation dépendent du programme choisi.",
    sources: [{ label: "JNTO — l’art des wagashi", url: "https://www.japan.travel/en/sg/story/wagashi-delectable-art-form-learn-craft-traditional-japanese-con/" }],
  },
  {
    ...publication, id: "activity-furoshiki", universe: "activites", slug: "initiation-furoshiki", title: "Les gestes du furoshiki", activityType: "Artisanat et gestes", format: "editorial-idea",
    location: { kind: "city", id: "city-jp-kyoto" }, photograph: photos.craft, photographCaption: "Furoshiki : une illustration des objets et des gestes, sans prestataire associé.", tags: ["Culturel", "Gestes", "Textile"],
    summary: "Un carré de tissu, quelques plis et un nœud : redécouvrir l’art d’envelopper.",
    description: ["Le furoshiki sert à envelopper et à transporter des objets. La forme ne vient pas d’un emballage prédécoupé : elle apparaît lorsque le tissu rencontre ce qu’il protège.", "Une initiation peut commencer par un objet simple. Adapter les plis, observer la tenue d’un nœud, puis défaire le tout permet de comprendre le caractère réutilisable de cette pratique."],
    experience: "S’exercer à partir des schémas du ministère japonais de l’Environnement, ou rechercher une initiation locale à Kyoto. Cette proposition éditoriale n’est pas un atelier commercial disponible à la réservation.",
    sources: [{ label: "Ministère de l’Environnement — pliages du furoshiki", url: "https://www.env.go.jp/en/focus/attach/060403-5.html" }],
  },
  {
    ...publication, id: "activity-ueno-sketch", universe: "activites", slug: "carnet-croquis-ueno", title: "Un carnet de croquis à Ueno", activityType: "Promenade créative", format: "editorial-idea",
    location: { kind: "district", id: "district-tokyo-ueno" }, photograph: photos.uenoPark, photographCaption: "L’étang d’Ueno, un point de départ pour observer le paysage.", tags: ["Naturel", "Créatif"],
    summary: "S’arrêter devant un arbre, une rive ou une silhouette et laisser le crayon prolonger le regard.",
    description: ["Cette promenade autonome est une proposition de Nagi. Elle ne demande pas de produire un beau dessin : quelques lignes, une forme ou une note suffisent pour retenir ce que l’on voit.", "Le parc d’Ueno offre des sujets à plusieurs échelles. On peut choisir un détail proche, puis regarder ce qui l’entoure. Dessiner devient alors une manière de ralentir et de remarquer ce qui change."],
    experience: "Emporter un carnet et un crayon, choisir un endroit où l’on ne gêne pas le passage, puis observer avant de dessiner. Respecter les indications du parc et laisser les lieux tels qu’on les a trouvés.",
    venue: { universe: "tourisme", id: "place-ueno-park" }, additionalInformation: "Promenade autonome proposée par Nagi, sans encadrement, matériel fourni ni réservation.",
    sources: [{ label: "Gouvernement métropolitain de Tokyo — informations sur le parc", url: "https://www.kensetsu.metro.tokyo.lg.jp/jimusho/toubuk/ueno/" }],
  },
];

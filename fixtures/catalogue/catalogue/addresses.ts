import type { AddressDiscovery } from "../../../src/types/discoveries";
import { destinationPhotographs } from "../destination-photographs";
import { publication, verificationDate } from "./common";

export const addresses: readonly AddressDiscovery[] = [
  {
    ...publication, id: "address-bairin", universe: "adresses", slug: "ginza-bairin", title: "Ginza Bairin", establishmentType: "Restaurant de tonkatsu", location: { kind: "district", id: "district-tokyo-ginza" },
    photograph: destinationPhotographs.ginza, photographCaption: "Ginza — vue du quartier. Cette photographie ne représente pas le restaurant.", tags: ["Restaurant", "Tonkatsu"],
    summary: "À Ginza, une maison consacrée au tonkatsu et aux différentes façons de le déguster.",
    description: ["Fondée en 1927, Ginza Bairin décline la viande panée en plusieurs préparations. Le filet et la longe permettent de comparer des textures différentes ; le sandwich prolonge la spécialité sous une autre forme.", "L’intérêt de cette adresse tient à son lien avec un plat. Lire la fiche du tonkatsu avant la visite donne quelques repères pour regarder la coupe, la panure et les accompagnements."],
    postalAddress: "7-8-1 Ginza, Chūō-ku, Tokyo 104-0061, Japon", website: "https://ginzabairin.jp/", specialtyIds: ["food-tonkatsu"], verifiedAt: verificationDate,
    sources: [{ label: "Ginza Bairin — site officiel et carte", url: "https://ginzabairin.jp/" }, { label: "Présentation officielle en anglais", url: "https://www.ginzabairin.com/en/index.php" }],
  },
  {
    ...publication, id: "address-maisen", universe: "adresses", slug: "maisen-aoyama", title: "Tonkatsu Maisen Aoyama", establishmentType: "Restaurant de tonkatsu", location: { kind: "city", id: "city-jp-tokyo" }, tags: ["Restaurant", "Tonkatsu"],
    summary: "Dans le secteur d’Omotesandō, la maison principale de Maisen met le tonkatsu au centre de la table.",
    description: ["Maisen Aoyama se trouve à Jingūmae, dans le secteur d’Omotesandō. La carte s’organise autour du porc pané, avec différentes découpes et préparations.", "Cette adresse complète celle de Ginza dans le carnet : une même spécialité, deux établissements, et autant d’occasions d’observer ce qui fait le caractère d’une maison."],
    postalAddress: "4-8-5 Jingūmae, Shibuya-ku, Tokyo, Japon", website: "https://mai-sen.com/restaurant/aoyama/", specialtyIds: ["food-tonkatsu"], verifiedAt: verificationDate,
    sources: [{ label: "Maisen — restaurant Aoyama, adresse et carte officielles", url: "https://mai-sen.com/restaurant/aoyama/" }],
  },
  {
    ...publication, id: "address-kamiya", universe: "adresses", slug: "kamiya-kaminarimon", title: "Asakusa Monja Kamiya Kaminarimon", establishmentType: "Restaurant de teppan", location: { kind: "district", id: "district-tokyo-asakusa" }, tags: ["Restaurant", "Teppan", "À partager"],
    summary: "À Asakusa, une table pour rapprocher monjayaki et okonomiyaki autour de la plaque de cuisson.",
    description: ["Kamiya réunit sur sa carte le monjayaki et l’okonomiyaki. Deux préparations proches par leurs ingrédients et leur cuisson, mais différentes par leur consistance et leur manière de se déguster.", "Le site officiel indique l’établissement à Asakusa Aqua Building. L’adresse ci-dessous correspond à cette implantation, et non à l’ancien emplacement sur Kaminarimon-dōri."],
    postalAddress: "Asakusa Aqua Building, 2e étage, 1-34-4 Asakusa, Taitō-ku, Tokyo 111-0032, Japon", website: "https://kamiya-kaminarimon-monja.com/", specialtyIds: ["food-monjayaki", "food-okonomiyaki"], verifiedAt: verificationDate,
    sources: [{ label: "Kamiya — site officiel et localisation", url: "https://kamiya-kaminarimon-monja.com/" }, { label: "Kamiya — monjayaki et okonomiyaki à la carte", url: "https://kamiya-kaminarimon-monja.com/menu/" }],
  },
  {
    ...publication, id: "address-creoru", universe: "adresses", slug: "creo-ru-dotonbori", title: "Creo-Ru Dōtonbori", establishmentType: "Restaurant de spécialités d’Osaka", location: { kind: "city", id: "city-jp-osaka" },
    photograph: destinationPhotographs.osaka, photographCaption: "Dōtonbori — vue du quartier. Cette photographie ne représente pas l’établissement.", tags: ["Restaurant", "Teppan", "À partager"],
    summary: "Sur Dōtonbori, takoyaki et okonomiyaki se rencontrent dans une même adresse.",
    description: ["Creo-Ru Dōtonbori propose plusieurs préparations associées à Osaka, dont les takoyaki au poulpe et les okonomiyaki. La carte fait se rencontrer deux expressions de la cuisine à base de farine.", "Cette fiche relie l’établissement aux spécialités du carnet. Pour choisir une formule, vérifier les services disponibles ou préparer une visite, consulter les informations actuelles de la maison."],
    postalAddress: "1-6-4 Dōtonbori, Chūō-ku, Osaka, Japon", website: "https://creo-ru.com/creo-ru-store/tenpo/dotonbori/", specialtyIds: ["food-takoyaki", "food-okonomiyaki"], verifiedAt: verificationDate,
    sources: [{ label: "Creo-Ru Dōtonbori — adresse et spécialités officielles", url: "https://creo-ru.com/creo-ru-store/tenpo/dotonbori/" }],
  },
];

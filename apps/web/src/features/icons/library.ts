import names from './names.generated.json';

export const libraryIconNames: readonly string[] = names;
const registered = new Set(libraryIconNames);

export function isLibraryIcon(name: string) {
  return registered.has(name);
}

const translations: Record<string, string[]> = {
  livre: ['book', 'library'],
  source: ['book', 'link', 'quote', 'newspaper'],
  lien: ['link', 'external'],
  carte: ['map', 'card'],
  localisation: ['map', 'pin', 'locate'],
  etoile: ['star', 'sparkle'],
  coeur: ['heart'],
  maison: ['house', 'home'],
  calendrier: ['calendar'],
  date: ['calendar', 'clock'],
  horloge: ['clock', 'watch'],
  info: ['info', 'circle-help'],
  recherche: ['search'],
  photo: ['camera', 'image'],
  image: ['image', 'camera'],
  document: ['file', 'notebook'],
  utilisateur: ['user', 'contact'],
  personnes: ['users', 'people'],
  prix: ['euro', 'dollar', 'coins', 'banknote'],
  argent: ['coins', 'banknote', 'wallet'],
  repas: ['utensils', 'cooking', 'food'],
  restaurant: ['utensils', 'chef', 'cooking'],
  cafe: ['coffee', 'cup'],
  train: ['train', 'tram'],
  avion: ['plane'],
  velo: ['bike'],
  voiture: ['car'],
  bateau: ['ship', 'sailboat'],
  montagne: ['mountain'],
  nature: ['tree', 'flower', 'leaf'],
  soleil: ['sun'],
  nuit: ['moon'],
  telephone: ['phone', 'smartphone'],
  courriel: ['mail'],
  message: ['message', 'mail'],
  bouton: ['mouse-pointer', 'square'],
  musique: ['music', 'audio'],
  securite: ['shield', 'lock'],
  valider: ['check'],
};
export function searchLibraryIcons(query: string) {
  const normalized = query
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  if (!normalized) return libraryIconNames;
  const tokens = normalized.split(/[\s_-]+/).filter(Boolean);
  return libraryIconNames.filter((name) =>
    tokens.every(
      (token) =>
        name.includes(token) || translations[token]?.some((keyword) => name.includes(keyword)),
    ),
  );
}

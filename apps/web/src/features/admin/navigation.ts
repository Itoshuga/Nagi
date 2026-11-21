export const adminNavigation = [
  { label: 'Général', items: [{ label: 'Vue d’ensemble', href: '/admin', icon: 'overview' }] },
  {
    label: 'Contenu',
    items: [
      { label: 'Pays', href: '/admin/countries', icon: 'countries' },
      { label: 'Villes', href: '/admin/cities', icon: 'cities' },
      { label: 'Quartiers', href: '/admin/neighborhoods', icon: 'neighborhoods' },
      { label: 'Catégories', href: '/admin/categories', icon: 'categories' },
      { label: 'Fiches', href: '/admin/entries', icon: 'entries' },
      { label: 'Relations', href: '/admin/relations', icon: 'relations' },
    ],
  },
  {
    label: 'Discord',
    items: [
      { label: 'Bot', href: '/admin/bot', icon: 'bot' },
      { label: 'Commandes', href: '/admin/commands', icon: 'commands' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { label: 'Utilisateurs', href: '/admin/users', icon: 'users' },
      { label: 'Paramètres', href: '/admin/settings', icon: 'settings' },
      { label: 'Intégrations', href: '/admin/settings/integrations', icon: 'settings' },
    ],
  },
];
export const sectionInfo: Record<string, { title: string; description: string }> = {
  countries: { title: 'Pays', description: 'Le premier point de repère de vos destinations.' },
  cities: {
    title: 'Villes',
    description: 'Des villes reliées à leur pays, pour organiser les découvertes.',
  },
  neighborhoods: {
    title: 'Quartiers',
    description: 'Une organisation plus précise, activable pour chaque ville.',
  },
  categories: {
    title: 'Catégories',
    description: 'Les différentes façons de découvrir une destination.',
  },
  entries: {
    title: 'Fiches',
    description: 'Les expériences et les adresses qui méritent le détour.',
  },
  relations: {
    title: 'Relations',
    description: 'Les liens entre les fiches, toutes catégories confondues.',
  },
  bot: { title: 'Bot Discord', description: 'La connexion entre votre communauté et Nagi.' },
  commands: {
    title: 'Commandes',
    description: 'Le registre publié lors de la dernière synchronisation réussie.',
  },
  users: {
    title: 'Utilisateurs',
    description: 'Les comptes Discord inscrits sur Nagi et leurs rôles.',
  },
  settings: { title: 'Paramètres', description: 'La configuration de votre espace Nagi.' },
};

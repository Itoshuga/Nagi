import Link from 'next/link';
export const metadata = { title: 'Confidentialité · Nagi' };
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-12 text-sm leading-7">
      <Link href="/" className="text-primary-ink">
        Nagi
      </Link>
      <h1 className="text-3xl font-semibold">Confidentialité</h1>
      <p>
        Nagi permet aux membres d’un serveur Discord d’organiser leurs voyages ensemble. Les
        informations de compte, les appartenances aux espaces et les données de planification sont
        traitées pour fournir ce service. Les accès aux voyages sont limités aux membres autorisés
        de leur espace.
      </p>
      <h2 className="text-lg font-semibold">Recherche de lieux Google Maps</h2>
      <p>
        La recherche Google Maps est facultative. Quand vous l’utilisez, les composants officiels
        Google reçoivent votre recherche et, si vous activez cette préférence, un contexte
        géographique issu du voyage. Le navigateur communique directement avec Google, qui peut
        recevoir notamment votre adresse IP et les informations techniques de connexion. Nagi ne
        demande pas votre position réelle.
      </p>
      <p>
        Nagi conserve les identifiants des lieux Google et vos informations de planification :
        journées, horaires, durées, notes, couleurs et positions. Les réponses Google, noms,
        adresses, avis et photographies ne sont pas importés dans le catalogue ni conservés dans le
        stockage Nagi. Les coordonnées nécessaires à la carte sont traitées temporairement en
        mémoire et expirent ; elles ne sont pas sauvegardées dans les tables de voyage.
      </p>
      <p>
        Les notes du voyage et les identifiants Discord ne sont pas envoyés à Google. Le texte que
        vous saisissez dans une recherche de lieu est transmis à Google pour répondre à cette
        recherche. Vous pouvez continuer à utiliser le catalogue Nagi et les étapes personnalisées
        sans utiliser Google Maps.
      </p>
      <p>
        Le traitement réalisé par Google est décrit dans sa{' '}
        <a
          className="text-primary-ink underline"
          href="https://policies.google.com/privacy"
          target="_blank"
          rel="noreferrer"
        >
          politique de confidentialité
        </a>
        . L’utilisation de ces services est également soumise aux{' '}
        <a
          className="text-primary-ink underline"
          href="https://maps.google.com/help/terms_maps/"
          target="_blank"
          rel="noreferrer"
        >
          conditions Google Maps
        </a>
        .
      </p>
      <h2 className="text-lg font-semibold">Données partagées et suppression</h2>
      <p>
        Les membres autorisés d’un voyage peuvent consulter et modifier ses informations selon son
        mode de collaboration. La suppression d’une étape retire ses informations du voyage. La
        suppression d’un compte conserve les contributions partagées nécessaires aux autres
        participants, en supprimant leur association à l’auteur lorsque le modèle de données le
        prévoit. Vous pouvez demander l’exercice de vos droits au responsable du service.
      </p>
      <p>
        Responsable : {process.env.NAGI_SERVICE_OPERATOR || 'l’exploitant du service Nagi'}.{' '}
        {process.env.NAGI_PRIVACY_CONTACT
          ? `Contact : ${process.env.NAGI_PRIVACY_CONTACT}.`
          : 'Pour toute demande, contactez l’administrateur de Nagi.'}
      </p>
      <Link href="/terms" className="text-primary-ink underline">
        Conditions d’utilisation
      </Link>
    </main>
  );
}

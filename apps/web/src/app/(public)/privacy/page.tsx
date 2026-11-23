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
      <h2 className="text-lg font-semibold">Recherche et cartes Mapbox</h2>
      <p>
        La recherche Mapbox est facultative. Votre recherche et, si vous activez cette préférence,
        un contexte géographique du voyage sont transmis par le serveur Nagi à Mapbox. Les notes et
        identifiants Discord ne lui sont pas transmis. Nagi ne demande pas votre position réelle. Le
        navigateur charge directement les tuiles cartographiques Mapbox ; le fournisseur reçoit
        alors votre adresse IP et les informations techniques nécessaires à cette connexion.
      </p>
      <p>
        Nagi conserve l’identifiant Mapbox, votre recherche saisie et vos données de planification :
        journées, horaires, durées, notes, couleurs et positions dans le voyage. Les noms, adresses,
        coordonnées et informations enrichies du fournisseur sont utilisés temporairement pour
        l’affichage, sans import dans le catalogue ni stockage durable dans Nagi. Une référence
        devenue indisponible peut être réassociée sans perdre votre planification.
      </p>
      <p>
        Vous pouvez organiser un voyage avec le catalogue Nagi et les étapes personnalisées.
        Consultez la{' '}
        <a
          className="text-primary-ink underline"
          href="https://www.mapbox.com/legal/privacy"
          target="_blank"
          rel="noreferrer"
        >
          politique de confidentialité Mapbox
        </a>{' '}
        et ses{' '}
        <a
          className="text-primary-ink underline"
          href="https://www.mapbox.com/legal/tos"
          target="_blank"
          rel="noreferrer"
        >
          conditions d’utilisation
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

import Link from 'next/link';
export const metadata = { title: 'Conditions d’utilisation · Nagi' };
export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-12 text-sm leading-7">
      <Link href="/" className="text-primary-ink">
        Nagi
      </Link>
      <h1 className="text-3xl font-semibold">Conditions d’utilisation</h1>
      <p>
        Nagi est un service collaboratif de planification. Vous êtes responsable des informations
        que vous saisissez, de leur partage avec les membres de votre espace et de la vérification
        des réservations, horaires et modalités de déplacement auprès des prestataires concernés.
      </p>
      <p>
        Le catalogue Nagi, les étapes personnalisées et les lieux Mapbox sont des sources
        distinctes. Ajouter un lieu Mapbox à un voyage ne crée pas de fiche éditoriale Nagi. Les
        informations du catalogue et des fournisseurs externes peuvent changer ou devenir
        indisponibles ; cette indisponibilité ne supprime pas vos notes et votre planification.
      </p>
      <p>
        Les fonctionnalités Mapbox facultatives sont soumises aux{' '}
        <a
          className="text-primary-ink underline"
          href="https://www.mapbox.com/legal/tos"
          target="_blank"
          rel="noreferrer"
        >
          conditions d’utilisation Mapbox
        </a>{' '}
        et aux règles du fournisseur. Les attributions, liens et mentions Mapbox présents dans les
        composants doivent être respectés. Vous ne devez pas détourner le service pour extraire
        massivement des données, contourner des restrictions ou épuiser les quotas des autres
        utilisateurs.
      </p>
      <p>
        Le traitement des données personnelles est décrit dans la{' '}
        <Link className="text-primary-ink underline" href="/privacy">
          politique de confidentialité Nagi
        </Link>{' '}
        et, pour les services Mapbox, dans la{' '}
        <a
          className="text-primary-ink underline"
          href="https://www.mapbox.com/legal/privacy"
          target="_blank"
          rel="noreferrer"
        >
          politique de confidentialité Mapbox
        </a>
        .
      </p>
      <p>
        Exploitant : {process.env.NAGI_SERVICE_OPERATOR || 'l’exploitant du service Nagi'}.{' '}
        {process.env.NAGI_PRIVACY_CONTACT
          ? `Contact : ${process.env.NAGI_PRIVACY_CONTACT}.`
          : 'Pour toute demande, contactez l’administrateur de Nagi.'}
      </p>
    </main>
  );
}

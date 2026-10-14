"use client";

import Link from "next/link";
import { AdminNotice } from "@/components/admin/ui";

export default function AdminError({ reset }: { reset: () => void }) {
  return <main id="contenu" className="admin-error-page" tabIndex={-1}><h1>Un instant de pause.</h1><AdminNotice>L’espace d’administration est momentanément indisponible. Veuillez réessayer.</AdminNotice><button className="admin-button admin-button-primary" onClick={reset}>Réessayer</button><Link className="admin-back-link" href="/">Retour au site</Link></main>;
}

import { geographySource } from "@/lib/geography/public";
import { ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { AdminPageTitle } from "@/components/admin/ui";
import { SESSION_DURATION_SECONDS } from "@/lib/auth/policy";

export const metadata = { title: "Paramètres de l’administration" };

export default async function AdminSettings() {
  const user = await requireAdmin();
  return <><AdminPageTitle eyebrow="Paramètres" title="Votre espace, en toute clarté.">Consultez les informations de votre compte et de votre session.</AdminPageTitle><section className="admin-settings-card"><div className="admin-section-heading"><h2>Compte & sécurité</h2><ShieldCheck size={22} strokeWidth={1.5} aria-hidden="true" /></div><dl className="admin-settings-list"><div><dt>Adresse email</dt><dd>{user.email}</dd></div><div><dt>Rôle</dt><dd>Administrateur</dd></div><div><dt>Durée maximale de session</dt><dd>{SESSION_DURATION_SECONDS / 3600} heures</dd></div><div><dt>Catalogue public</dt><dd>{geographySource() === "firestore" ? "Destinations administrées" : "Carnet de démonstration"}</dd></div><div><dt>Environnement Firebase</dt><dd>{process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === "true" ? "Émulateurs locaux" : "Projet Firebase"}</dd></div></dl><p className="admin-settings-hint">Les accès sont attribués par la personne responsable du projet. Pour modifier votre compte ou votre rôle, contactez-la.</p></section></>;
}

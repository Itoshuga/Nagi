import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { getAdminSession } from "@/lib/auth/session";
import { getFirebasePublicConfig } from "@/lib/firebase/config";
import { isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import { LoginForm } from "@/components/admin/login-form";
import { AdminNotice } from "@/components/admin/ui";

export const metadata = { title: "Connexion à l’administration" };

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const [session, { reason }] = await Promise.all([getAdminSession(), searchParams]);
  if (session.status === "authorized") redirect("/admin");
  const available = Boolean(getFirebasePublicConfig() && isFirebaseAdminConfigured());
  return <main id="contenu" className="admin-login" tabIndex={-1}>
    <section className="admin-login-story" aria-label="L’esprit Nagi"><Link href="/" className="admin-brand admin-login-brand" aria-label="Nagi — accueil">nagi<span>.</span></Link><div className="admin-login-photo"><Image src="/images/editorial-garden.jpg" alt="Un jardin japonais, entre végétation et architecture de bois" fill sizes="(max-width: 800px) 100vw, 50vw" priority /></div><div className="admin-login-editorial"><p className="eyebrow">Le carnet, côté coulisses</p><h2>Chaque voyage commence<br />par un regard.</h2><p>Un espace pour cultiver les lieux, les rencontres et les découvertes qui font Nagi.</p></div><span className="admin-login-edition">Nagi · L’art de prendre le temps</span></section>
    <section className="admin-login-panel"><Link href="/" className="admin-back-link"><ArrowLeft size={16} aria-hidden="true" />Retour au site</Link><div className="admin-login-content"><p className="eyebrow">Bienvenue dans les coulisses</p><h1>Heureux de vous retrouver.</h1><p className="admin-login-description">Connectez-vous pour accéder à votre espace d’administration.</p>
      {!available ? <AdminNotice kind="info">La connexion n’est pas encore disponible. Contactez la personne responsable de Nagi.</AdminNotice> : session.status === "denied" || reason === "forbidden" ? <AdminNotice>Accès refusé. Ce compte ne dispose pas du rôle administrateur. Contactez la personne responsable de Nagi.</AdminNotice> : session.status === "unavailable" || reason === "unavailable" ? <AdminNotice>Le service de connexion est momentanément indisponible. Veuillez réessayer.</AdminNotice> : reason === "signed-out" ? <AdminNotice kind="success">Vous êtes déconnecté.</AdminNotice> : reason === "session" ? <AdminNotice kind="info">Connectez-vous pour ouvrir une session d’administration.</AdminNotice> : null}
      <LoginForm available={available} /></div><p className="admin-login-help">Besoin d’un accès ? Contactez la personne responsable du projet.<Link href="/">Découvrir Nagi <ArrowUpRight size={14} aria-hidden="true" /></Link></p></section>
  </main>;
}

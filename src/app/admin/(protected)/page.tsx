import { getAdminGeography } from "@/lib/geography/admin";
import { geographySource } from "@/lib/geography/public";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Coffee, CookingPot, Earth, Landmark, MapPin, Sparkles } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { AdminNotice, AdminPageTitle } from "@/components/admin/ui";

const universes = [
  { label: "Tourisme", icon: Landmark, description: "Les lieux qui invitent à regarder autrement.", detail: "Sites, culture & patrimoine" },
  { label: "Activités", icon: Sparkles, description: "Les expériences qui donnent le rythme du voyage.", detail: "Gestes, rencontres & découvertes" },
  { label: "Gastronomie", icon: CookingPot, description: "Les saveurs et les histoires à partager.", detail: "Spécialités & traditions" },
  { label: "Adresses", icon: Coffee, description: "Les bonnes portes à pousser, au fil des rues.", detail: "Établissements & petits refuges" },
];

export default async function AdminDashboard() {
  const user = await requireAdmin();
  const geography = await getAdminGeography().catch(() => null);
  return <>
    <AdminPageTitle eyebrow="Vue d’ensemble" title={user.name ? `Bienvenue, ${user.name}.` : "Bienvenue dans les coulisses."}>Retrouvez vos destinations et faites grandir le carnet, une escale après l’autre.</AdminPageTitle>
    <section className="admin-welcome"><div><span className="admin-badge">Votre carnet prend vie</span><h2>Prendre soin de chaque découverte.</h2><p>Créez vos pays, ajoutez leurs villes et enrichissez-les de quartiers. Gardez le temps de préparer chaque escale avant de la publier.</p><Link href="/" className="admin-inline-link">Parcourir le carnet <ArrowUpRight size={16} aria-hidden="true" /></Link></div><div className="admin-welcome-photo"><Image src="/images/kyoto-hero.jpg" alt="La sérénité d’un jardin de Kyoto depuis une pièce à tatamis" fill loading="eager" sizes="(max-width: 600px) 100vw, 360px" /></div></section>
    <section className="admin-section" aria-labelledby="destinations-title"><div className="admin-section-heading"><div><p className="eyebrow">01 — Les escales</p><h2 id="destinations-title">Vos destinations</h2></div><span className="admin-badge">Votre géographie</span></div><div className="admin-destination-grid"><Link className="admin-empty" href="/admin/countries"><span className="admin-icon-tile"><Earth size={24} strokeWidth={1.5} aria-hidden="true" /></span><h3>Pays</h3><p>Ouvrez un carnet, présentez le pays et organisez ses villes.</p><span className="admin-badge">{geography ? `${geography.countries.filter((item) => !item.archivedAt).length} pays` : "Ouvrir"}</span><span className="admin-inline-link geo-dashboard-link">Gérer les pays <ArrowUpRight size={16} aria-hidden="true" /></span></Link><Link className="admin-empty" href="/admin/cities"><span className="admin-icon-tile"><MapPin size={24} strokeWidth={1.5} aria-hidden="true" /></span><h3>Villes & Quartiers</h3><p>Des grandes escales aux ruelles plus discrètes, une géographie reliée et cohérente.</p><span className="admin-badge">{geography ? `${geography.cities.filter((item) => !item.archivedAt).length} villes` : "Ouvrir"}</span><span className="admin-inline-link geo-dashboard-link">Gérer les villes <ArrowUpRight size={16} aria-hidden="true" /></span></Link></div></section>
    <section className="admin-section" aria-labelledby="universes-title"><div className="admin-section-heading"><div><p className="eyebrow">02 — Les découvertes</p><h2 id="universes-title">Quatre regards sur le voyage</h2></div></div><div className="admin-universe-grid">{universes.map(({ label, icon: Icon, description, detail }) => <article className="admin-universe-card" key={label}><div className="admin-card-top"><span className="admin-icon-tile"><Icon size={21} strokeWidth={1.5} aria-hidden="true" /></span><span className="admin-badge">À venir</span></div><h3>{label}</h3><p>{description}</p><small>{detail}</small></article>)}</div></section>
    {geographySource() === "static" && <AdminNotice kind="info">Le site affiche encore le carnet de démonstration. Votre catalogue administré pourra être mis en ligne après validation du projet.</AdminNotice>}
    <aside className="admin-note"><span className="admin-note-dot" /><p>Les quatre univers conservent leur sélection actuelle. Leur édition sera disponible lors d’une prochaine étape.</p></aside>
  </>;
}

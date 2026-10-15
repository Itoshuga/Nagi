import { coverPhotograph, protectedPhoto } from "@/lib/photos/schema";
import { photoByteLimit } from "@/lib/photos/processing";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Coffee, CookingPot, Landmark, Sparkles, Plus } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { getAdminGeography } from "@/lib/geography/admin";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { legacyPhotograph } from "@/lib/photos/legacy";
import { listContents, readContent, readRelatedContents, ContentError, type ContentFilters } from "@/lib/contents/store";
import { toPublicContent, visibleContent } from "@/lib/contents/presentation";
import { publicGeographyFromDocuments } from "@/lib/geography/presentation";
import { universeDetails } from "@/data/universes";
import { isUniverse } from "@/lib/discoveries";
import { idSchema } from "@/lib/geography/schema";
import { ContentEditor } from "@/components/admin/contents/editor";
import { ArchiveContentButton } from "@/components/admin/contents/archive-button";
import { AdminNotice, AdminPageTitle } from "@/components/admin/ui";
import { GeographyBreadcrumbs } from "@/components/admin/geography/page";
import { DiscoveryArticle } from "@/components/discoveries/discovery-article";
import "../../../../decouvertes/discoveries.css";

export const metadata = { title: "Les découvertes" };
type Query = Record<string, string | string[] | undefined>;
const one = (query: Query, key: string) => typeof query[key] === "string" ? query[key] : "";
const choices = [{ type: "tourisme", icon: Landmark }, { type: "activites", icon: Sparkles }, { type: "gastronomie", icon: CookingPot }, { type: "adresses", icon: Coffee }] as const;
async function renderContents({ params, searchParams }: PageProps<"/admin/contents/[[...path]]">) {
  await requireAdmin();
  const { path = [] } = await params; const query = await searchParams;
  if (path.length > 2 || path.length === 2 && !["edit", "preview"].includes(path[1]) || path[0] && path[0] !== "new" && !idSchema.safeParse(path[0]).success) notFound();
  if (path[0] === "new" && path.length > 1) notFound();
  if (path[0] === "new" && !isUniverse(one(query, "type"))) return <><GeographyBreadcrumbs items={[{ label: "Découvertes", href: "/admin/contents" }, { label: "Créer" }]} /><AdminPageTitle eyebrow="Une nouvelle page" title="Quel regard sur le voyage ?">Choisissez un univers. L’éditeur vous proposera les champs utiles à cette découverte.</AdminPageTitle><div className="content-type-grid">{choices.map(({ type, icon: Icon }) => <Link className="admin-universe-card" key={type} href={`/admin/contents/new?type=${type}`}><span className="admin-icon-tile"><Icon size={24} /></span><h2>{universeDetails[type].name}</h2><p>{universeDetails[type].description}</p><span className="admin-inline-link">Créer une fiche →</span></Link>)}</div></>;
    const db = getAdminFirestore(); const data = await getAdminGeography();
    const publicGeography = publicGeographyFromDocuments(data);
    const options = { countries: data.countries.filter((item) => !item.archivedAt).map(({ id, name, status }) => ({ id, name, status })), cities: data.cities.filter((item) => !item.archivedAt).map(({ id, name, status, countryId }) => ({ id, name, status, countryId })), districts: data.districts.filter((item) => !item.archivedAt).map(({ id, name, status, cityId }) => ({ id, name, status, cityId })) };
    if (path.length) {
      const initial = path[0] === "new" ? undefined : await readContent(db, path[0]) ?? undefined;
      if (path[0] !== "new" && !initial) notFound();
      const related = initial ? await readRelatedContents(db, initial) : { contents: [], relations: [] };
      if (initial && path[1] === "preview") {
        const geography = publicGeographyFromDocuments({ countries: data.countries.map((item) => ({ ...item, status: "published", visibility: "public", archivedAt: null })), cities: data.cities.map((item) => ({ ...item, status: "published", visibility: "public", archivedAt: null })), districts: data.districts.map((item) => ({ ...item, status: "published", visibility: "public", archivedAt: null })) });
        const item = toPublicContent(initial, geography, related.relations, true);
        return <div className="content-preview"><AdminNotice kind="info">Prévisualisation privée de la version enregistrée. Cette page est réservée aux administrateurs ; elle n’active aucune publication.</AdminNotice><Link className="admin-back-link" href={`/admin/contents/${initial.id}`}>← Revenir à l’éditeur</Link><DiscoveryArticle item={item} preview={{ geography, catalogue: [item, ...related.contents.map((entry) => toPublicContent(entry, geography, related.relations, true))] }} /></div>;
      }
      if (initial?.isArchived) return <><AdminPageTitle eyebrow="Archives" title={initial.title}>Cette fiche et ses relations ont été conservées.</AdminPageTitle><ArchiveContentButton id={initial.id} title={initial.title} revision={initial.revision} archived /><Link href="/admin/contents?view=archived" className="admin-back-link">Retour aux archives</Link></>;
      const type = initial?.type ?? one(query, "type"); if (!isUniverse(type)) notFound();
      return <><GeographyBreadcrumbs items={[{ label: "Découvertes", href: "/admin/contents" }, { label: initial ? initial.title : universeDetails[type].name }]} /><AdminPageTitle eyebrow={universeDetails[type].name} title={initial ? `Modifier ${initial.title}` : "Une découverte à partager."}>Un récit, des repères et des liens pour enrichir le carnet.</AdminPageTitle>{one(query, "saved") === "1" && <AdminNotice kind="success">La découverte et ses relations ont bien été enregistrées.</AdminNotice>}{initial?.status === "published" && initial.visibility === "public" && !visibleContent(initial, publicGeography) && <AdminNotice kind="info">Cette fiche est publiée mais reste masquée : ses destinations ou leurs parents ne sont pas publics. Vous pouvez poursuivre son édition.</AdminNotice>}<ContentEditor maxPhotoBytes={photoByteLimit()} key={initial ? `${initial.id}:${initial.revision}` : type} type={type} initial={initial} geography={options} initialRelations={related.contents.map((item) => ({ id: item.id, type: item.type, title: item.title, status: item.isArchived ? "archived" : item.status }))} /></>;
    }
    const type = one(query, "type"); const status = one(query, "status"); const geo = one(query, "geo");
    if (type && !isUniverse(type) || status && !["draft", "published"].includes(status) || geo && !/^(country|city|district):[a-zA-Z0-9_-]{1,128}$/.test(geo)) throw new ContentError("Un filtre est invalide. Réinitialisez la recherche.");
    const filters: ContentFilters = { type: isUniverse(type) ? type : undefined, status: status === "draft" || status === "published" ? status : undefined, archived: one(query, "view") === "archived", geo: geo || undefined, q: one(query, "q").slice(0, 120), cursor: one(query, "cursor") || undefined };
    const result = await listContents(db, filters);
    const next = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => typeof entry[1] === "string")); if (result.nextCursor) next.set("cursor", result.nextCursor);
    return <><div className="geo-page-heading"><AdminPageTitle eyebrow="Les quatre univers" title="Vos découvertes, un même carnet.">Retrouvez les lieux, expériences, spécialités et adresses que vous avez pris soin de raconter.</AdminPageTitle><Link className="admin-button admin-button-primary" href="/admin/contents/new"><Plus size={17} />Créer une découverte</Link></div>

    <form method="get" action="/admin/contents" className="geo-list-toolbar content-list-toolbar"><div className="admin-field"><label htmlFor="q">Rechercher par titre</label><input id="q" name="q" placeholder="Début du titre…" maxLength={120} defaultValue={filters.q} /></div><div className="admin-field"><label htmlFor="filter-type">Univers</label><select name="type" id="filter-type" defaultValue={type}><option value="">Tous les univers</option>{choices.map(({ type }) => <option key={type} value={type}>{universeDetails[type].name}</option>)}</select></div><div className="admin-field"><label htmlFor="filter-status">Statut</label><select name="status" id="filter-status" defaultValue={status}><option value="">Tous les statuts</option><option value="draft">Brouillon</option><option value="published">Publié</option></select></div><div className="admin-field"><label htmlFor="filter-geo">Destination</label><select name="geo" id="filter-geo" defaultValue={geo}><option value="">Toutes les destinations</option>{options.countries.map((item) => <option key={item.id} value={`country:${item.id}`}>{item.name} · Pays</option>)}{options.cities.map((item) => <option key={item.id} value={`city:${item.id}`}>{options.countries.find((country) => country.id === item.countryId)?.name} → {item.name}</option>)}{options.districts.map((item) => <option key={item.id} value={`district:${item.id}`}>{options.cities.find((city) => city.id === item.cityId)?.name} → {item.name}</option>)}</select></div><div className="admin-field"><label htmlFor="filter-view">Carnet</label><select name="view" id="filter-view" defaultValue={filters.archived ? "archived" : "active"}><option value="active">Fiches actives</option><option value="archived">Archives</option></select></div><button className="admin-button admin-button-quiet">Afficher</button><Link href="/admin/contents" className="admin-back-link">Réinitialiser</Link></form><p className="geo-field-hint">Recherche par début de titre, sans accents. Jusqu’à 24 fiches par page, triées par titre.</p>
    <section className="geo-list-section" aria-label="Fiches du carnet">{result.documents.length ? <ul className="geo-list">{result.documents.map((item) => {
      const photo = coverPhotograph(item, legacyPhotograph(item.coverImage, item.coverPresentation?.alt ?? item.title, item.coverPresentation?.position, item.coverCredit)); const location = item.destinations[0]; const place = location && (location.kind === "country" ? data.countries : location.kind === "city" ? data.cities : data.districts).find((place) => place.id === location.id);
      return <li key={item.id} className="geo-row content-row"><span className="geo-row-photo">{photo ? <Image unoptimized={protectedPhoto(photo.src)} style={{ objectPosition: photo.position }} src={photo.src} alt="" fill sizes="64px" /> : <Sparkles size={23} />}</span><div className="geo-row-title"><Link href={`/admin/contents/${item.id}`}>{item.title}</Link><p>{universeDetails[item.type].name} · {place?.name ?? "Destination à préciser"}{item.destinations.length > 1 ? ` + ${item.destinations.length - 1}` : ""}</p></div><div className="geo-status"><span className={`admin-badge ${item.status === "published" ? "geo-badge-published" : ""}`}>{item.isArchived ? "Archivé" : item.status === "published" ? "Publié" : "Brouillon"}</span>{item.visibility === "private" && <small>Privé</small>}{item.status === "published" && item.visibility === "public" && !visibleContent(item, publicGeography) && <span className="geo-visibility-reason">Masqué : destination non publique</span>}</div><time className="geo-row-date" dateTime={item.updatedAt}>{new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(item.updatedAt))}</time><div className="geo-row-actions"><Link href={`/admin/contents/${item.id}`} className="admin-button admin-button-quiet">Modifier</Link><details className="geo-row-more"><summary aria-label={`Actions pour ${item.title}`}>•••</summary><div><Link href={`/admin/contents/${item.id}/preview`} className="admin-button admin-button-quiet">Prévisualiser</Link>{!item.isArchived && visibleContent(item, publicGeography) && <Link className="admin-button admin-button-quiet" href={`/decouvertes/${item.type}/${item.slug}`}>Voir sur le site</Link>}<ArchiveContentButton id={item.id} title={item.title} revision={item.revision} archived={item.isArchived} /></div></details></div></li>;
    })}</ul> : <div className="geo-empty"><span className="admin-icon-tile"><Sparkles size={25} /></span><h2>Aucune découverte dans cette sélection.</h2><p>Essayez d’autres filtres ou ouvrez une nouvelle page du carnet.</p><Link href="/admin/contents/new" className="admin-button admin-button-primary">Créer une découverte</Link></div>}{result.nextCursor && <Link className="admin-button admin-button-quiet content-next" href={`/admin/contents?${next}`}>Page suivante →</Link>}</section></>;
}

export default async function ContentsPage(props: PageProps<"/admin/contents/[[...path]]">) {
  try { return await renderContents(props); } catch (error) {
    // Les signaux de navigation Next.js doivent traverser cette frontière.
    if (error && typeof error === "object" && "digest" in error && String(error.digest).startsWith("NEXT_")) throw error;
    return <><AdminPageTitle eyebrow="Les découvertes" title="Le carnet attend un instant.">Vos fiches restent conservées.</AdminPageTitle><AdminNotice>{error instanceof ContentError ? error.message : "Les découvertes sont indisponibles. Vérifiez la configuration Firestore et ses index avant de réessayer."}</AdminNotice><Link href="/admin/contents">Réinitialiser la liste</Link></>;
  }
}

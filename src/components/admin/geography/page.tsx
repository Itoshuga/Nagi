import { coverPhotograph, protectedPhoto } from "@/lib/photos/schema";
import { photoByteLimit } from "@/lib/photos/processing";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowRight, ArrowUpRight, Earth, MapPin, Pencil, Plus, Search } from "lucide-react";
import { getAdminGeography } from "@/lib/geography/admin";
import { GeographyError } from "@/lib/geography/store";
import { geographySource } from "@/lib/geography/public";
import { visibilityReason, type DestinationKind, type ManagedDestination, type ManagedGeography } from "@/lib/geography/schema";
import { AdminNotice, AdminPageTitle } from "../ui";
import { DestinationForm } from "./form";
import { ArchiveDestinationButton } from "./archive-button";

type Query = Record<string, string | string[] | undefined>;
const date = (value: string) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "Europe/Paris" }).format(new Date(value));
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
const single = (query: Query, key: string) => typeof query[key] === "string" ? query[key] : "";
export function geographyAdminPath(item: ManagedDestination) { return `/admin/${item.kind}/${item.id}${item.kind === "districts" ? "/edit" : ""}`; }
export function GeographyBreadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return <nav className="geo-breadcrumbs" aria-label="Fil d’Ariane"><ol><li><Link href="/admin">Administration</Link></li>{items.map((item, index) => <li key={`${item.label}-${index}`}>{item.href ? <Link href={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}</li>)}</ol></nav>;
}
function breadcrumbsFor(item: ManagedDestination | undefined, data: ManagedGeography) {
  const items = [{ label: "Pays", href: "/admin/countries" }];
  if (!item) return items;
  const city = item.kind === "cities" ? item : item.kind === "districts" ? data.cities.find((city) => city.id === item.cityId) : undefined;
  const country = item.kind === "countries" ? item : data.countries.find((country) => country.id === city?.countryId);
  if (country) items.push({ label: country.name, href: geographyAdminPath(country) });
  if (city) items.push({ label: city.name, href: geographyAdminPath(city) });
  if (item.kind === "districts") items.push({ label: item.name, href: geographyAdminPath(item) });
  return items;
}
function publicPath(item: ManagedDestination, data: ManagedGeography) {
  const city = item.kind === "cities" ? item : item.kind === "districts" ? data.cities.find((city) => city.id === item.cityId) : undefined;
  const country = item.kind === "countries" ? item : data.countries.find((country) => country.id === city?.countryId);
  return country ? `/destinations/${country.slug}${city ? `/${city.slug}` : ""}${item.kind === "districts" ? `/${item.slug}` : ""}` : null;
}
function descendantCount(item: ManagedDestination, data: ManagedGeography) {
  if (item.kind === "districts") return 0;
  if (item.kind === "cities") return data.districts.filter((district) => district.cityId === item.id).length;
  const cities = data.cities.filter((city) => city.countryId === item.id);
  return cities.length + data.districts.filter((district) => cities.some((city) => city.id === district.cityId)).length;
}
function Status({ item, data }: { item: ManagedDestination; data: ManagedGeography }) {
  const reason = visibilityReason(item, data);
  return <div className="geo-status"><span className={`admin-badge ${!reason ? "geo-badge-published" : ""}`}>{item.archivedAt ? "Archivé" : item.status === "published" ? "Publié" : "Brouillon"}</span>{reason && item.status === "published" && !item.archivedAt && <span className="geo-visibility-reason">{reason}</span>}</div>;
}
function SourceNotice() {
  return geographySource() === "static" ? <AdminNotice kind="info">Le site présente encore le carnet de démonstration. La mise en ligne de votre catalogue reste à activer par la personne responsable du projet.</AdminNotice> : null;
}
function DestinationList({ kind, items, data, query, basePath, createPath }: { kind: DestinationKind; items: ManagedDestination[]; data: ManagedGeography; query: Query; basePath: string; createPath: string | null }) {
  const q = single(query, "q").slice(0, 120); const view = single(query, "view") === "archived" ? "archived" : "active";
  const sort = single(query, "sort") || "order";
  const filtered = items.filter((item) => Boolean(item.archivedAt) === (view === "archived") && normalize(item.name).includes(normalize(q))).sort((a, b) => sort === "updated" ? b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name, "fr") : sort === "name" ? a.name.localeCompare(b.name, "fr") : a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "fr"));
  return <section className="geo-list-section"><form className="geo-list-toolbar" action={basePath} method="get"><div className="geo-search"><Search size={17} aria-hidden="true" /><label className="geo-sr-only" htmlFor="geo-search">Rechercher par nom</label><input id="geo-search" name="q" defaultValue={q} placeholder="Rechercher par nom…" maxLength={120} /></div><div className="admin-field"><label className="geo-sr-only" htmlFor="geo-view">Afficher</label><select name="view" id="geo-view" defaultValue={view}><option value="active">Destinations actives</option><option value="archived">Archives</option></select></div><div className="admin-field"><label className="geo-sr-only" htmlFor="geo-sort">Trier par</label><select id="geo-sort" name="sort" defaultValue={sort}><option value="order">Ordre d’affichage</option><option value="name">Nom, de A à Z</option><option value="updated">Modifications récentes</option></select></div><button type="submit" className="admin-button admin-button-quiet">Afficher</button></form>
    <div className="geo-list-caption"><span>{filtered.length} {kind === "countries" ? "pays" : kind === "cities" ? `ville${filtered.length > 1 ? "s" : ""}` : `quartier${filtered.length > 1 ? "s" : ""}`}</span>{(q || view === "archived") && <Link href={basePath}>Réinitialiser</Link>}</div>
    {filtered.length ? <ul className="geo-list">{filtered.map((item) => {
      const count = item.kind === "countries" ? data.cities.filter((city) => city.countryId === item.id && !city.archivedAt).length : item.kind === "cities" ? data.districts.filter((district) => district.cityId === item.id && !district.archivedAt).length : 0;
      const parentName = item.kind === "cities" ? data.countries.find((country) => country.id === item.countryId)?.name : item.kind === "districts" ? data.cities.find((city) => city.id === item.cityId)?.name : "";
      const photo = coverPhotograph(item, item.coverImage);
      return <li key={item.id} className="geo-row"><span className="geo-row-photo">{photo ? <Image unoptimized={protectedPhoto(photo.src)} src={photo.src} alt="" fill sizes="72px" style={{ objectPosition: photo.position }} /> : <Earth size={25} strokeWidth={1.2} aria-hidden="true" />}</span><div className="geo-row-title"><Link href={geographyAdminPath(item)}>{item.name}</Link><p>{item.kind === "countries" ? [item.isoCode, item.continent].filter(Boolean).join(" · ") : parentName}{item.kind !== "districts" && <span>{item.kind === "countries" ? `${count} ville${count > 1 ? "s" : ""}` : `${count} quartier${count > 1 ? "s" : ""}`}</span>}</p></div><Status item={item} data={data} /><time className="geo-row-date" dateTime={item.updatedAt}>Modifié le {date(item.updatedAt)}</time><div className="geo-row-actions">{!item.archivedAt && <Link className="admin-button admin-button-quiet" href={`${geographyAdminPath(item)}${item.kind === "districts" ? "" : "/edit"}`} aria-label={`Modifier ${item.name}`}><Pencil size={15} aria-hidden="true" /><span>Modifier</span></Link>}<details className="geo-row-more"><summary aria-label={`Autres actions pour ${item.name}`}>•••</summary><div><ArchiveDestinationButton kind={item.kind} id={item.id} name={item.name} revision={item.revision} archived={Boolean(item.archivedAt)} childrenCount={descendantCount(item, data)} /></div></details>{item.kind !== "districts" && <Link className="geo-open-link" href={geographyAdminPath(item)} aria-label={`Gérer les ${item.kind === "countries" ? "villes" : "quartiers"} de ${item.name}`}><ArrowRight size={19} /></Link>}</div></li>;
    })}</ul> : <div className="geo-empty"><span className="admin-icon-tile">{kind === "countries" ? <Earth size={24} /> : <MapPin size={24} />}</span><h3>{q ? "Aucune destination trouvée." : view === "archived" ? "Vos archives sont vides." : "Une première escale à écrire."}</h3><p>{q ? "Essayez un autre nom ou réinitialisez la recherche." : view === "archived" ? "Les destinations archivées seront conservées ici." : kind === "districts" ? "Cette ville peut vivre sans quartier. Ajoutez-en un lorsque vous souhaitez enrichir le carnet." : `Ajoutez ${kind === "countries" ? "un pays" : "une ville"} pour ouvrir ce carnet.`}</p>{!q && view !== "archived" && createPath && <Link className="admin-button admin-button-primary" href={createPath}><Plus size={16} aria-hidden="true" />Ajouter {kind === "countries" ? "un pays" : kind === "cities" ? "une ville" : "un quartier"}</Link>}</div>}
  </section>;
}

export async function GeographyPage({ kind, path, query }: { kind: DestinationKind; path: string[]; query: Query }) {
  let data: ManagedGeography;
  try { data = await getAdminGeography(); } catch (error) {
    return <><AdminPageTitle eyebrow="Destinations" title="Votre carnet géographique">Pays, villes et quartiers, dans un même fil de voyage.</AdminPageTitle><AdminNotice>{error instanceof GeographyError ? error.message : "Les destinations sont momentanément indisponibles. La personne responsable du projet peut vérifier leur configuration avant de réessayer."}</AdminNotice><Link className="admin-back-link" href="/admin">Retour à la vue d’ensemble</Link></>;
  }
  if (path[0] === "new" && path.length !== 1) notFound();
  if (path.length > 2 || (path.length === 2 && path[1] !== "edit")) notFound();
  const initial = path[0] && path[0] !== "new" ? data[kind].find((item) => item.id === path[0]) : undefined;
  if (path[0] && path[0] !== "new" && !initial) notFound();
  const isForm = path[0] === "new" || path[1] === "edit" || kind === "districts" && Boolean(initial);
  if (isForm) {
    const parentId = kind === "cities" ? single(query, "country") : kind === "districts" ? single(query, "city") : "";
    const parent = kind === "cities" ? data.countries.find((country) => country.id === parentId) : kind === "districts" ? data.cities.find((city) => city.id === parentId) : undefined;
    if (parentId && (!parent || parent.archivedAt)) notFound();
    if (initial?.archivedAt) return <><GeographyBreadcrumbs items={breadcrumbsFor(initial, data)} /><AdminNotice kind="info">Cette destination est archivée. Restaurez-la depuis sa liste avant de la modifier.</AdminNotice></>;
    const context = initial ?? parent;
    const returnPath = initial ? initial.kind === "districts" ? `/admin/cities/${initial.cityId}` : geographyAdminPath(initial) : parent ? geographyAdminPath(parent) : kind === "countries" ? "/admin/countries" : "/admin/cities";
    const initialParentId = initial?.kind === "cities" ? initial.countryId : initial?.kind === "districts" ? initial.cityId : parentId;
    const parents = kind === "cities" ? data.countries.filter((parent) => !parent.archivedAt || parent.id === initialParentId).map((parent) => ({ id: parent.id, name: parent.name })) : data.cities.filter((parent) => !parent.archivedAt || parent.id === initialParentId).map((parent) => ({ id: parent.id, name: parent.name, context: data.countries.find((country) => country.id === parent.countryId)?.name }));
    if (kind !== "countries" && parents.length === 0) return <><AdminPageTitle eyebrow="Destinations" title="Une première destination parente">Ajoutez {kind === "cities" ? "un pays" : "une ville"} avant de poursuivre.</AdminPageTitle><Link className="admin-button admin-button-primary" href={kind === "cities" ? "/admin/countries/new" : "/admin/cities/new"}>Ajouter {kind === "cities" ? "un pays" : "une ville"}</Link></>;
    return <><GeographyBreadcrumbs items={[...breadcrumbsFor(context, data), { label: initial ? "Modifier" : `Ajouter ${kind === "countries" ? "un pays" : kind === "cities" ? "une ville" : "un quartier"}` }]} /><AdminPageTitle eyebrow="Votre carnet géographique" title={initial ? `Modifier ${initial.name}` : `Ajouter ${kind === "countries" ? "un pays" : kind === "cities" ? "une ville" : "un quartier"}`}>Prenez le temps de présenter cette destination. Vous pourrez la publier lorsque vous serez prêt.</AdminPageTitle><SourceNotice /><DestinationForm maxPhotoBytes={photoByteLimit()} kind={kind} initial={initial} parents={parents} parentId={parentId || undefined} returnPath={returnPath} /></>;
  }
  const listedKind: DestinationKind = initial?.kind === "countries" ? "cities" : initial?.kind === "cities" ? "districts" : kind;
  const items: ManagedDestination[] = initial?.kind === "countries" ? data.cities.filter((city) => city.countryId === initial.id) : initial?.kind === "cities" ? data.districts.filter((district) => district.cityId === initial.id) : data[kind];
  const basePath = initial ? geographyAdminPath(initial) : `/admin/${kind}`;
  const createPath = `/admin/${listedKind}/new${initial ? `?${initial.kind === "countries" ? "country" : "city"}=${initial.id}` : ""}`;
  const pageTitle = initial ? initial.name : kind === "countries" ? "Vos pays, premiers horizons." : kind === "cities" ? "Villes & quartiers." : "Vos quartiers.";
  const detailPhoto = initial ? coverPhotograph(initial, initial.coverImage) : null;
  const url = initial && !visibilityReason(initial, data) && geographySource() === "firestore" ? publicPath(initial, data) : null;
  return <><GeographyBreadcrumbs items={initial ? breadcrumbsFor(initial, data).map((item, index, all) => index === all.length - 1 ? { label: item.label } : item) : [{ label: kind === "countries" ? "Pays" : kind === "cities" ? "Villes & Quartiers" : "Quartiers" }]} />
    <div className="geo-page-heading"><AdminPageTitle eyebrow={initial ? "Votre carnet géographique" : "Les destinations"} title={pageTitle}>{initial ? initial.summary : kind === "countries" ? "Ouvrez un carnet, puis enrichissez-le de villes et de quartiers, à votre rythme." : "Retrouvez vos villes et ouvrez chacune d’elles pour gérer ses quartiers."}</AdminPageTitle>{!initial?.archivedAt && <Link className="admin-button admin-button-primary" href={createPath}><Plus size={17} aria-hidden="true" />Ajouter {listedKind === "countries" ? "un pays" : listedKind === "cities" ? "une ville" : "un quartier"}</Link>}</div>
    {single(query, "saved") === "1" && <AdminNotice kind="success">La destination a bien été enregistrée.</AdminNotice>}<SourceNotice />
    {initial && <section className="geo-detail-card">{detailPhoto && <div className="geo-detail-cover"><Image unoptimized={protectedPhoto(detailPhoto.src)} src={detailPhoto.src} alt={detailPhoto.alt} fill sizes="220px" style={{ objectPosition: detailPhoto.position }} /></div>}<div className="geo-detail-copy"><Status item={initial} data={data} /><p>{initial.description}</p><div className="geo-detail-actions">{!initial.archivedAt && <Link className="admin-button admin-button-quiet" href={`${geographyAdminPath(initial)}/edit`}><Pencil size={15} aria-hidden="true" />Modifier {initial.kind === "countries" ? "le pays" : initial.kind === "cities" ? "la ville" : "le quartier"}</Link>}{url && <Link className="admin-button admin-button-quiet" href={url}>Voir sur le site<ArrowUpRight size={15} aria-hidden="true" /></Link>}<ArchiveDestinationButton kind={initial.kind} id={initial.id} name={initial.name} revision={initial.revision} archived={Boolean(initial.archivedAt)} childrenCount={descendantCount(initial, data)} /></div></div></section>}
    {initial && <div className="geo-child-heading"><h2>{listedKind === "cities" ? "Les villes de ce pays" : "Les quartiers de cette ville"}</h2><p>{listedKind === "districts" ? "Les quartiers sont facultatifs. Les découvertes peuvent aussi être rattachées directement à la ville." : "Chaque ville possède son propre carnet, avec ou sans quartiers."}</p></div>}
    <DestinationList kind={listedKind} items={items} data={data} query={query} basePath={basePath} createPath={initial?.archivedAt ? null : createPath} />
  </>;
}

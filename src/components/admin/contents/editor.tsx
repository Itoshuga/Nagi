"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getCsrfToken } from "@/lib/auth/browser";
import { classifications, contentInputSchema, detailSchemas, type ContentInput, type ContentType, type ManagedContent } from "@/lib/contents/schema";
import { proposedSlug } from "@/lib/geography/schema";
import { contentCover } from "@/data/content-covers";
import { coverPhotograph } from "@/lib/photos/schema";
import { CoverUpload, type CoverUploadHandle } from "../photos/cover-upload";
import { universeDetails } from "@/data/universes";
import { GeographyPicker, type GeographyOptions } from "./geography-picker";
import { RelationPicker, type RelationOption } from "./relation-picker";
import { AdminNotice, AdminSpinner } from "../ui";

export function emptyContent(type: ContentType): ContentInput {
  const details = detailSchemas[type].parse({ category: classifications[type][0] });
  const initial = contentInputSchema.parse({ type, details, title: "Nouvelle découverte", slug: "nouvelle-decouverte", status: "draft" });
  return { ...initial, title: "", slug: "" };
}
export function contentInput(document: ManagedContent): ContentInput {
  const { images: _legacyImages, imageCaptions: _legacyCaptions, photos: _legacyPhotos, photoAssetIds: _photos, id: _id, schemaVersion: _schema, locale: _locale, createdAt: _created, updatedAt: _updated, publishedAt: _published, archivedAt: _archived, revision: _revision, searchTitle: _search, geographyKeys: _keys, isArchived: _isArchived, ...input } = document;
  void [_legacyImages, _legacyCaptions, _legacyPhotos, _photos, _id, _schema, _locale, _created, _updated, _published, _archived, _revision, _search, _keys, _isArchived]; return input;
}
type Field = { key: string; label: string; kind?: "long" | "list" | "url"; hint?: string };
const fields: Record<ContentType, Field[]> = {
  tourisme: [{ key: "history", label: "Histoire du lieu", kind: "long" }, { key: "features", label: "Particularités", kind: "long" }, { key: "address", label: "Adresse physique" }, { key: "visitDuration", label: "Durée indicative" }, { key: "price", label: "Prix indicatif" }, { key: "openingHours", label: "Horaires", kind: "long" }, { key: "officialUrl", label: "Site officiel", kind: "url" }, { key: "access", label: "Informations d’accès", kind: "long" }, { key: "tips", label: "Conseils de visite", kind: "long" }],
  activites: [{ key: "experience", label: "Particularités de l’expérience", kind: "long" }, { key: "duration", label: "Durée indicative" }, { key: "budget", label: "Budget indicatif" }, { key: "bookingUrl", label: "Lien externe de réservation", kind: "url" }, { key: "conditions", label: "Conditions de participation", kind: "long" }, { key: "audience", label: "Public concerné", kind: "list", hint: "Un public par ligne." }, { key: "additionalInformation", label: "Informations complémentaires", kind: "long" }],
  gastronomie: [{ key: "originalName", label: "Nom dans la langue locale" }, { key: "transliteration", label: "Translittération" }, { key: "origins", label: "Origine" }, { key: "history", label: "Origine et histoire", kind: "long" }, { key: "ingredients", label: "Ingrédients caractéristiques", kind: "list", hint: "Un ingrédient par ligne." }, { key: "preparation", label: "Préparation traditionnelle", kind: "long" }, { key: "variants", label: "Variantes", kind: "list", hint: "Une variante par ligne." }, { key: "culturalNotes", label: "Particularités culturelles", kind: "long" }],
  adresses: [{ key: "mainSpecialty", label: "Spécialité principale" }, { key: "postalAddress", label: "Adresse postale" }, { key: "openingHours", label: "Horaires", kind: "long" }, { key: "closedDays", label: "Jours de fermeture" }, { key: "budget", label: "Fourchette de prix" }, { key: "waitingTime", label: "Attente indicative" }, { key: "website", label: "Site officiel", kind: "url" }, { key: "bookingUrl", label: "Lien externe de réservation", kind: "url" }, { key: "tips", label: "Conseils et informations complémentaires", kind: "long" }],
};
export function ContentEditor({ type, initial, geography, initialRelations, maxPhotoBytes }: { type: ContentType; initial?: ManagedContent; geography: GeographyOptions; initialRelations: RelationOption[]; maxPhotoBytes: number }) {
  const [data, setData] = useState<ContentInput>(() => initial ? contentInput(initial) : emptyContent(type));
  const photoUpload = useRef<CoverUploadHandle>(null);
  const [photoSelected, setPhotoSelected] = useState(false);
  const [draftId] = useState(() => crypto.randomUUID());
  const legacyCover = contentCover(data.coverImage);
  const photograph = coverPhotograph(initial, legacyCover ? { ...legacyCover, ...data.coverPresentation } : null);
  const [tagsText, setTagsText] = useState(data.tags.join(", "));
  const [relations, setRelations] = useState(initialRelations); const [pending, setPending] = useState(false); const [failure, setFailure] = useState(""); const [errors, setErrors] = useState<Record<string, string>>({});
  const initialCoords = initial && (initial.type === "tourisme" || initial.type === "adresses") ? initial.details.coordinates : null;
  const [gps, setGps] = useState({ latitude: initialCoords ? String(initialCoords.latitude) : "", longitude: initialCoords ? String(initialCoords.longitude) : "" });
  const form = useRef<HTMLFormElement>(null); const submitting = useRef(false); const leaving = useRef(false); const editedSlug = useRef(Boolean(initial)); const router = useRouter();
  const leaveDialog = useRef<HTMLDialogElement>(null); const destination = useRef("");
  const [original] = useState(() => JSON.stringify({ data, relations, gps, tagsText }));
  const dirty = photoSelected || JSON.stringify({ data, relations, gps, tagsText }) !== original;
  useEffect(() => {
    function unload(event: BeforeUnloadEvent) { if (dirty && !leaving.current) { event.preventDefault(); event.returnValue = ""; } }
    function navigate(event: MouseEvent) {
      const link = (event.target as Element)?.closest?.("a[href]");
      if (dirty && !leaving.current && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && link instanceof HTMLAnchorElement && !link.hasAttribute("target") && !link.getAttribute("href")?.startsWith("#")) {
        event.preventDefault(); event.stopPropagation(); destination.current = link.href; leaveDialog.current?.showModal();
      }
    }
    window.addEventListener("beforeunload", unload); document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [dirty]);
  const update = (key: string, value: unknown) => setData((data) => ({ ...data, [key]: value }) as ContentInput);
  const detail = (key: string, value: unknown) => setData((data) => ({ ...data, details: { ...data.details, [key]: value } }) as ContentInput);
  const details = data.details as unknown as Record<string, string | string[]>;
  function error(key: string) { return errors[key] ? <p id={`error-${key}`} className="geo-field-error">{errors[key]}</p> : null; }
  function a11y(key: string) { return { "aria-invalid": Boolean(errors[key]), "aria-describedby": errors[key] ? `error-${key}` : undefined }; }
  function focusErrors(fields: Record<string, string>) { const key = Object.keys(fields)[0]; const input = form.current?.elements.namedItem(key); if (input instanceof HTMLElement) input.focus(); else document.getElementById(key?.split(".")[0])?.focus(); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (submitting.current) return;
    const normalizedDetails = Object.fromEntries(Object.entries(data.details).map(([key, value]) => [key, Array.isArray(value) ? value.map((text) => text.trim()).filter(Boolean) : value]));
    const raw = { ...data, tags: tagsText.split(",").map((text) => text.trim()).filter(Boolean), details: normalizedDetails, ...(type === "tourisme" || type === "adresses" ? { details: { ...normalizedDetails, coordinates: !gps.latitude && !gps.longitude ? null : { latitude: gps.latitude ? Number(gps.latitude) : NaN, longitude: gps.longitude ? Number(gps.longitude) : NaN } } } : {}) };
    const parsed = contentInputSchema.safeParse(raw);
    if (!parsed.success) { const next: Record<string, string> = {}; for (const issue of parsed.error.issues) next[issue.path.slice(0, typeof issue.path[2] === "number" ? 2 : undefined).join(".")] ??= issue.message; setErrors(next); setFailure("Quelques informations restent à vérifier."); focusErrors(next); return; }
    submitting.current = true; setPending(true); setErrors({}); setFailure("");
    try {
      const csrf = await getCsrfToken();
      const uploaded = await photoUpload.current?.upload({ kind: "contents", id: initial?.id ?? null, draftId }, csrf, parsed.data.title);
      const savedData = uploaded ? { ...parsed.data, coverPhoto: uploaded } : parsed.data;
      const response = await fetch(`/api/admin/contents${initial ? `/${initial.id}` : ""}`, { method: initial ? "PUT" : "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify({ data: savedData, expectedRevision: initial?.revision ?? null, relations: relations.map(({ id, type }) => ({ id, type })) }) });
      const body = await response.json(); if (!response.ok) { setErrors(body.fields ?? {}); focusErrors(body.fields ?? {}); throw new Error(body.error); }
      leaving.current = true; router.push(`/admin/contents/${body.content.id}?saved=1`); router.refresh();
    } catch (error) { setFailure(error instanceof Error ? error.message : "Enregistrement impossible."); submitting.current = false; setPending(false); }
  }
  return <form className="content-editor" ref={form} onSubmit={submit} noValidate aria-busy={pending}>
    <dialog ref={leaveDialog} className="geo-confirm-dialog" aria-labelledby="content-leave-title"><h2 id="content-leave-title">Conserver vos modifications ?</h2><p className="geo-publication-note">Cette fiche contient des modifications non enregistrées. Restez sur cette page pour les sauvegarder avant de poursuivre.</p><div className="geo-confirm-actions"><button className="admin-button admin-button-primary" type="button" onClick={() => leaveDialog.current?.close()}>Rester sur la fiche</button><button className="admin-button admin-button-quiet" type="button" onClick={() => { leaving.current = true; leaveDialog.current?.close(); const url = new URL(destination.current); if (url.origin === window.location.origin) router.push(url.pathname + url.search + url.hash); else window.location.assign(url.href); }}>Quitter sans enregistrer</button></div></dialog>
    {failure && <div className="content-wide"><AdminNotice>{failure}</AdminNotice></div>}
    <div className="content-editor-main"><fieldset className="geo-fieldset" disabled={pending}><legend>Votre découverte</legend><p className="geo-section-description">{universeDetails[type].name} · Le type sera conservé après la création. * Champ obligatoire ; la présentation et la destination sont requises pour publier.</p>
    <div className="admin-field"><label htmlFor="title">Titre *</label><input id="title" name="title" value={data.title} maxLength={160} onChange={(event) => { update("title", event.target.value); if (!editedSlug.current) update("slug", proposedSlug(event.target.value)); }} {...a11y("title")} />{error("title")}</div>
    <div className="admin-field"><label htmlFor="slug">Adresse URL *</label><input id="slug" name="slug" value={data.slug} maxLength={100} readOnly={Boolean(initial?.publishedAt)} onChange={(event) => { editedSlug.current = true; update("slug", event.target.value); }} {...a11y("slug")} />{error("slug")}<p className="geo-field-hint">{initial?.publishedAt ? "Adresse protégée : cette fiche a déjà été publiée." : "Proposée à partir du titre ; vous pouvez la corriger avant la publication."}</p></div>
    <div className="admin-field"><label htmlFor="summary">Résumé</label><textarea id="summary" name="summary" rows={3} maxLength={600} value={data.summary} onChange={(event) => update("summary", event.target.value)} {...a11y("summary")} />{error("summary")}</div>
    <div className="admin-field"><label htmlFor="description">Présentation détaillée</label><textarea id="description" name="description" rows={9} maxLength={20000} value={data.description} onChange={(event) => update("description", event.target.value)} {...a11y("description")} />{error("description")}<p className="geo-field-hint">Texte simple. Séparez les paragraphes par une ligne vide.</p></div>
    <div className="admin-field"><label htmlFor="tags">Tags</label><input id="tags" name="tags" value={tagsText} onChange={(event) => setTagsText(event.target.value)} /><p className="geo-field-hint">Séparez les tags par des virgules.</p>{error("tags")}</div></fieldset>
    <fieldset className="geo-fieldset" disabled={pending}><legend>{type === "gastronomie" ? "La spécialité, en détail" : "Repères & informations pratiques"}</legend><div className="admin-field"><label htmlFor="details.category">{type === "gastronomie" ? "Catégorie" : "Type"} *</label>{type === "gastronomie" ? <select id="details.category" name="details.category" value={details.category as string} onChange={(event) => detail("category", event.target.value)}>{classifications[type].map((value) => <option key={value}>{value}</option>)}</select> : <><input id="details.category" name="details.category" list="content-categories" value={details.category as string} onChange={(event) => detail("category", event.target.value)} {...a11y("details.category")} /><datalist id="content-categories">{classifications[type].map((value) => <option key={value} value={value} />)}</datalist><p className="geo-field-hint">Choisissez une proposition ou écrivez votre propre classification.</p></>}{error("details.category")}</div>
    {type === "activites" && <div className="admin-field"><label htmlFor="activity-format">Nature de la fiche</label><select id="activity-format" value={details.format as string} onChange={(event) => detail("format", event.target.value)}><option value="editorial-idea">Idée éditoriale, sans réservation proposée</option><option value="offered-experience">Expérience proposée par un organisateur identifié</option></select><p className="geo-field-hint">Aucune disponibilité réelle n’est annoncée par Nagi.</p></div>}
    {type === "tourisme" && <div className="admin-field"><label htmlFor="admission">Accès</label><select id="admission" value={details.admission as string} onChange={(event) => detail("admission", event.target.value)}><option value="">Non renseigné</option><option value="free">Gratuit</option><option value="paid">Payant</option><option value="mixed">Selon les espaces</option></select></div>}
    {fields[type].map((field) => <div className="admin-field" key={field.key}><label htmlFor={`details.${field.key}`}>{field.label} <span>Facultatif</span></label>{field.kind === "long" || field.kind === "list" ? <textarea id={`details.${field.key}`} name={`details.${field.key}`} rows={field.kind === "long" ? 4 : 3} value={Array.isArray(details[field.key]) ? (details[field.key] as string[]).join("\n") : details[field.key] as string} onChange={(event) => detail(field.key, field.kind === "list" ? event.target.value.split("\n") : event.target.value)} {...a11y(`details.${field.key}`)} /> : <input id={`details.${field.key}`} name={`details.${field.key}`} type={field.kind === "url" ? "url" : "text"} value={details[field.key] as string} onChange={(event) => detail(field.key, event.target.value)} {...a11y(`details.${field.key}`)} />}{error(`details.${field.key}`)}{field.hint && <p className="geo-field-hint">{field.hint}</p>}</div>)}
    {(type === "adresses" || type === "activites") && <div className="admin-field"><label htmlFor="reservation">Réservation</label><select id="reservation" value={details.reservation as string} onChange={(event) => detail("reservation", event.target.value)}><option value="">Non renseigné</option><option value="not-required">Non nécessaire</option><option value="recommended">Conseillée</option><option value="required">Nécessaire</option></select></div>}
    {(type === "tourisme" || type === "adresses") && <div className="geo-form-grid" id="coordinates" tabIndex={-1}>{(["latitude", "longitude"] as const).map((key) => <div className="admin-field" key={key}><label htmlFor={`details.coordinates.${key}`}>{key === "latitude" ? "Latitude" : "Longitude"} <span>Facultatif</span></label><input type="number" step="any" id={`details.coordinates.${key}`} name={`details.coordinates.${key}`} value={gps[key]} onChange={(event) => setGps({ ...gps, [key]: event.target.value })} {...a11y(`details.coordinates.${key}`)} />{error(`details.coordinates.${key}`)}</div>)}</div>}
    </fieldset>
    <fieldset className="geo-fieldset" disabled={pending}><legend>{type === "adresses" ? "Spécialités proposées & activités" : "Les fiches associées"}</legend><RelationPicker type={type} selfId={initial?.id} value={relations} onChange={setRelations} error={errors.relations} /></fieldset>
    {!!data.sources.length && <fieldset className="geo-fieldset" disabled={pending}><legend>Sources conservées</legend>{data.sources.map((source, index) => <div className="content-source" key={index}><div className="admin-field"><label htmlFor={`source-label-${index}`}>Nom de la source</label><input id={`source-label-${index}`} value={source.label} onChange={(event) => update("sources", data.sources.map((value, i) => i === index ? { ...value, label: event.target.value } : value))} /></div><div className="admin-field"><label htmlFor={`source-url-${index}`}>Adresse de la source</label><input id={`source-url-${index}`} type="url" value={source.url} onChange={(event) => update("sources", data.sources.map((value, i) => i === index ? { ...value, url: event.target.value } : value))} /></div></div>)}</fieldset>}
    <CoverUpload ref={photoUpload} initial={photograph} disabled={pending} maxBytes={maxPhotoBytes} onSelectionChange={setPhotoSelected} /></div><aside className="content-editor-side"><fieldset className="geo-fieldset" disabled={pending}><legend>Publication</legend><div className="admin-field"><label htmlFor="status">Statut</label><select id="status" value={data.status} onChange={(event) => update("status", event.target.value)}><option value="draft">Brouillon</option><option value="published">Publié</option></select></div><div className="admin-field"><label htmlFor="visibility">Visibilité</label><select id="visibility" value={data.visibility} onChange={(event) => update("visibility", event.target.value)}><option value="public">Public après publication</option><option value="private">Privé</option></select></div><p className="geo-field-hint">Une destination parente masquée garde aussi cette fiche à l’écart du site. Les brouillons associés restent privés.</p><button className="admin-button admin-button-primary content-save" type="submit" disabled={pending}>{pending ? <AdminSpinner label="Enregistrement…" /> : "Enregistrer la découverte"}</button><p className="content-save-state" role="status">{dirty ? "Modifications non enregistrées" : initial ? "Toutes les modifications sont enregistrées" : "Votre nouveau carnet"}</p>{initial && <Link className="admin-back-link" href={`/admin/contents/${initial.id}/preview`} target="_blank" rel="noopener">Prévisualiser la version enregistrée ↗</Link>}</fieldset>
    <fieldset className="geo-fieldset" disabled={pending}><legend>{type === "gastronomie" ? "Destinations associées" : "Destination"}</legend><GeographyPicker data={geography} value={data.destinations} multiple={type === "gastronomie"} onChange={(value) => update("destinations", value)} error={errors.destinations} /></fieldset>
    <Link className="admin-back-link" href="/admin/contents">← Toutes les découvertes</Link></aside>
  </form>;
}

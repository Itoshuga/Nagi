"use client";

import Link from "next/link";
import Image from "next/image";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, LockKeyhole } from "lucide-react";
import { geographicCovers } from "@/data/geographic-covers";
import { continents, destinationInputSchema, destinationLabels, proposedSlug, type DestinationKind, type ManagedDestination } from "@/lib/geography/schema";
import { getCsrfToken } from "@/lib/auth/browser";
import { AdminNotice, AdminSpinner } from "../ui";

interface ParentOption { id: string; name: string; context?: string }
export function DestinationForm({ kind, initial, parents, parentId, returnPath }: { kind: DestinationKind; initial?: ManagedDestination; parents: ParentOption[]; parentId?: string; returnPath: string }) {
  const router = useRouter();
  const submitting = useRef(false);
  const slugEdited = useRef(Boolean(initial));
  const form = useRef<HTMLFormElement>(null);
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [cover, setCover] = useState(initial?.coverImage?.src ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const locked = Boolean(initial?.publishedAt);
  const parentField = kind === "cities" ? "countryId" : "cityId";
  const initialParent = initial && initial.kind !== "countries" ? initial.kind === "cities" ? initial.countryId : initial.cityId : parentId;
  const selectedPhoto = geographicCovers.find((photo) => photo.src === cover);
  function fieldError(name: string) { return fields[name] ? <p id={`error-${name}`} className="geo-field-error">{fields[name]}</p> : null; }
  function a11y(name: string) { return { "aria-invalid": Boolean(fields[name]), "aria-describedby": fields[name] ? `error-${name}` : undefined }; }
  function focusInvalid(errors: Record<string, string>) {
    const name = Object.keys(errors)[0];
    const element = form.current?.elements.namedItem(name);
    if (element instanceof HTMLElement) element.focus();
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (submitting.current) return;
    const values = new FormData(event.currentTarget);
    const raw = {
      kind, name: values.get("name"), nativeName: values.get("nativeName"), slug,
      summary: values.get("summary"), description: values.get("description"), coverImage: cover,
      status: values.get("status"), visibility: values.get("visibility"), sortOrder: Number(values.get("sortOrder")),
      ...(kind === "countries" ? { isoCode: values.get("isoCode"), continent: values.get("continent") } : { [parentField]: initialParent ?? values.get(parentField) }),
    };
    const checked = destinationInputSchema.safeParse(raw);
    if (!checked.success) {
      const errors: Record<string, string> = {};
      for (const issue of checked.error.issues) errors[String(issue.path[0])] ??= issue.message;
      setFields(errors); setError("Quelques informations restent à vérifier."); focusInvalid(errors); return;
    }
    submitting.current = true; setPending(true); setError(""); setFields({});
    try {
      const csrf = await getCsrfToken();
      const response = await fetch(`/api/admin/geography/${kind}${initial ? `/${initial.id}` : ""}`, {
        method: initial ? "PUT" : "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({ data: checked.data, expectedRevision: initial?.revision ?? null }),
      });
      const result = await response.json();
      if (!response.ok) { setFields(result.fields ?? {}); focusInvalid(result.fields ?? {}); throw new Error(result.error || "La sauvegarde a échoué."); }
      const item: ManagedDestination = result.destination;
      const path = item.kind === "districts" ? `/admin/cities/${item.cityId}` : `/admin/${item.kind}/${item.id}`;
      router.push(`${path}?saved=1`); router.refresh();
    } catch (failure) {
      setError(failure instanceof TypeError ? "La connexion a été interrompue. Vérifiez vos informations avant de réessayer." : failure instanceof Error ? failure.message : "La sauvegarde a échoué.");
      submitting.current = false; setPending(false);
    }
  }
  return <form ref={form} className="geo-form" onSubmit={submit} noValidate aria-busy={pending}>
    {error && <AdminNotice>{error}</AdminNotice>}
    <fieldset disabled={pending} className="geo-fieldset"><legend>Informations générales</legend><p className="geo-section-description">Les repères essentiels de votre {destinationLabels[kind]}. Les champs marqués * sont obligatoires.</p>
      <div className="geo-form-grid"><div className="admin-field"><label htmlFor="name">Nom *</label><input id="name" name="name" defaultValue={initial?.name} maxLength={120} required onChange={(event) => { if (!slugEdited.current) setSlug(proposedSlug(event.target.value)); }} {...a11y("name")} />{fieldError("name")}</div>
      <div className="admin-field"><label htmlFor="nativeName">Nom local <span>Facultatif</span></label><input id="nativeName" name="nativeName" defaultValue={initial?.nativeName} maxLength={120} {...a11y("nativeName")} />{fieldError("nativeName")}</div>
      {kind === "countries" ? <><div className="admin-field"><label htmlFor="isoCode">Code ISO <span>Facultatif</span></label><input id="isoCode" name="isoCode" defaultValue={initial?.kind === "countries" ? initial.isoCode : ""} maxLength={2} placeholder="JP" autoCapitalize="characters" {...a11y("isoCode")} />{fieldError("isoCode")}</div><div className="admin-field"><label htmlFor="continent">Continent <span>Facultatif</span></label><select id="continent" name="continent" defaultValue={initial?.kind === "countries" ? initial.continent : ""} {...a11y("continent")}><option value="">Non renseigné</option>{continents.map((continent) => <option key={continent}>{continent}</option>)}</select>{fieldError("continent")}</div></> : <div className="admin-field geo-full"><label htmlFor={parentField}>{kind === "cities" ? "Pays parent" : "Ville parente"} *</label><select id={parentField} name={parentField} defaultValue={initialParent ?? ""} disabled={Boolean(initialParent)} required {...a11y(parentField)}><option value="">Choisir {kind === "cities" ? "un pays" : "une ville"}</option>{parents.map((parent) => <option key={parent.id} value={parent.id}>{parent.context ? `${parent.context} → ` : ""}{parent.name}</option>)}</select><p className="geo-field-hint">{initialParent ? "La destination parente est conservée pendant l’édition." : "Vous pourrez ajouter ses propres destinations plus tard."}</p>{fieldError(parentField)}</div>}
      <div className="admin-field geo-full"><label htmlFor="slug">Adresse URL *</label><div className="geo-slug"><span>/</span><input id="slug" name="slug" value={slug} readOnly={locked} onChange={(event) => { slugEdited.current = true; setSlug(event.target.value); }} maxLength={80} required autoCapitalize="none" spellCheck={false} {...a11y("slug")} />{locked && <LockKeyhole size={16} aria-label="Adresse protégée" />}</div>{fieldError("slug")}<p className="geo-field-hint">{locked ? "Cette destination a déjà été publiée : son adresse est protégée pour préserver les liens existants." : "Proposée à partir du nom. Vous pouvez la corriger avant la première publication."}</p></div></div>
    </fieldset>
    <fieldset disabled={pending} className="geo-fieldset"><legend>Présentation</legend><div className="admin-field"><label htmlFor="summary">Résumé *</label><textarea id="summary" name="summary" rows={3} defaultValue={initial?.summary} maxLength={600} required {...a11y("summary")} />{fieldError("summary")}<p className="geo-field-hint">Quelques phrases pour donner envie de découvrir cette destination. 600 caractères maximum.</p></div><div className="admin-field"><label htmlFor="description">Description complète *</label><textarea id="description" name="description" rows={7} defaultValue={initial?.description} maxLength={20000} required {...a11y("description")} />{fieldError("description")}</div></fieldset>
    <fieldset disabled={pending} className="geo-fieldset"><legend>Apparence</legend><p className="geo-section-description">Choisissez une photographie déjà disponible dans le carnet.</p><div className="geo-cover-picker"><div className="admin-field"><label htmlFor="coverImage">Photographie principale <span>Facultatif</span></label><select id="coverImage" name="coverImage" value={cover} onChange={(event) => setCover(event.target.value)} {...a11y("coverImage")}><option value="">Sans photographie</option>{geographicCovers.map((photo) => <option key={photo.src} value={photo.src}>{photo.alt}</option>)}</select>{fieldError("coverImage")}<p className="geo-field-hint">Vous pourrez ajouter de nouvelles images lorsque la médiathèque sera disponible.</p></div>{selectedPhoto && <div className="geo-cover-preview"><Image src={selectedPhoto.src} alt={selectedPhoto.alt} fill sizes="200px" style={{ objectPosition: selectedPhoto.position }} /></div>}</div></fieldset>
    <fieldset disabled={pending} className="geo-fieldset"><legend>Publication</legend><div className="geo-form-grid"><div className="admin-field"><label htmlFor="status">Statut</label><select id="status" name="status" defaultValue={initial?.status ?? "draft"}><option value="draft">Brouillon</option><option value="published">Publié</option></select></div><div className="admin-field"><label htmlFor="visibility">Visibilité</label><select id="visibility" name="visibility" defaultValue={initial?.visibility ?? "public"}><option value="public">Public après publication</option><option value="private">Privé — administration uniquement</option></select></div><div className="admin-field"><label htmlFor="sortOrder">Ordre d’affichage</label><input id="sortOrder" name="sortOrder" type="number" min={0} max={1000000} step={1} defaultValue={initial?.sortOrder ?? 0} {...a11y("sortOrder")} />{fieldError("sortOrder")}<p className="geo-field-hint">Les nombres les plus petits apparaissent en premier.</p></div></div>{kind !== "countries" && <p className="geo-publication-note">Cette destination sera visible si elle est publique et publiée, et si ses destinations parentes le sont aussi. Aucun quartier n’est obligatoire pour publier une ville.</p>}</fieldset>
    <div className="geo-form-actions"><Link className="admin-back-link" href={returnPath}><ArrowLeft size={16} aria-hidden="true" />Revenir à la liste</Link><button type="submit" className="admin-button admin-button-primary" disabled={pending}>{pending ? <AdminSpinner label="Enregistrement…" /> : <><Check size={16} aria-hidden="true" />Enregistrer {initial ? "les modifications" : "la destination"}</>}</button></div>
  </form>;
}

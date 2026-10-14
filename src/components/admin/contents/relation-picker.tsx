"use client";
import { useEffect, useState } from "react";
import { universeDetails } from "@/data/universes";
import type { ContentReference, ContentType } from "@/lib/contents/schema";
import { contentKey } from "@/lib/contents/schema";

export interface RelationOption extends ContentReference { title: string; status: string }
export function RelationPicker({ type, selfId, value, onChange, error }: { type: ContentType; selfId?: string; value: RelationOption[]; onChange: (value: RelationOption[]) => void; error?: string }) {
  const allowed: ContentType[] = type === "tourisme" ? ["activites"] : type === "activites" ? ["tourisme", "adresses"] : type === "gastronomie" ? ["adresses"] : ["gastronomie", "activites"];
  const [targetType, setTargetType] = useState<ContentType>(allowed[0]); const [q, setQ] = useState("");
  const [items, setItems] = useState<RelationOption[]>([]); const [cursor, setCursor] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [failure, setFailure] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBusy(true); setFailure("");
      try { const response = await fetch(`/api/admin/contents/search?${new URLSearchParams({ type: targetType, q })}`, { signal: controller.signal }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setItems(result.items); setCursor(result.nextCursor); }
      catch (error) { if (!controller.signal.aborted) setFailure(error instanceof Error ? error.message : "Recherche indisponible."); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [q, targetType]);
  async function more() {
    if (!cursor || busy) return; setBusy(true);
    try { const response = await fetch(`/api/admin/contents/search?${new URLSearchParams({ type: targetType, q, cursor })}`); const result = await response.json(); if (!response.ok) throw new Error(result.error); setItems((items) => [...items, ...result.items]); setCursor(result.nextCursor); }
    catch { setFailure("La suite des résultats est indisponible. Relancez la recherche."); } finally { setBusy(false); }
  }
  return <div className="content-relations" id="relations" tabIndex={-1}>
    <p className="geo-section-description">{type === "adresses" ? "Sélectionnez les spécialités proposées et les activités organisées." : type === "gastronomie" ? "Retrouvez les établissements qui proposent cette spécialité." : type === "activites" ? "Associez un lieu touristique et, si utile, un établissement organisateur." : "Retrouvez les expériences associées à ce lieu."} La relation sera visible depuis les deux fiches.</p>
    <ul className="content-chips" aria-label="Relations sélectionnées">{value.map((item) => <li key={contentKey(item)}><span>{item.title}<small>{universeDetails[item.type].name} · {item.status === "published" ? "Publié" : "Brouillon ou archive"}</small></span><button type="button" aria-label={`Retirer la relation avec ${item.title}`} onClick={() => onChange(value.filter((entry) => contentKey(entry) !== contentKey(item)))}>×</button></li>)}</ul>
    <div className="geo-form-grid"><div className="admin-field"><label htmlFor="relation-type">Type de fiche à associer</label><select id="relation-type" value={targetType} onChange={(event) => { setItems([]); setCursor(null); setTargetType(event.target.value as ContentType); }}>{allowed.map((type) => <option key={type} value={type}>{universeDetails[type].name}</option>)}</select></div><div className="admin-field"><label htmlFor="relation-search">Rechercher une fiche</label><input id="relation-search" value={q} maxLength={120} onChange={(event) => { setItems([]); setCursor(null); setQ(event.target.value); }} placeholder="Début du titre…" /></div></div>
    <p className="geo-field-hint">Recherche par début de titre, sans distinction d’accents. Les brouillons peuvent être liés ; seuls les contenus publics apparaîtront sur le site.</p>
    <div aria-live="polite" className="content-relation-results" aria-busy={busy}>{failure ? <p className="geo-field-error">{failure}</p> : !items.length ? <p>{busy ? "Recherche…" : "Aucune fiche trouvée. Vous pouvez d’abord l’enregistrer depuis le carnet."}</p> : <ul>{items.filter((item) => item.id !== selfId).map((item) => {
      const selected = value.some((entry) => contentKey(entry) === contentKey(item));
      return <li key={contentKey(item)}><span>{item.title}<small>{universeDetails[item.type].name} · {item.status === "published" ? "Publié" : "Brouillon"}</small></span><button className="admin-button admin-button-quiet" type="button" disabled={selected || value.length >= 40} onClick={() => onChange([...value, item])}>{selected ? "Sélectionné" : "Ajouter"}</button></li>;
    })}</ul>}{cursor && <button type="button" className="admin-button admin-button-quiet" disabled={busy} onClick={more}>Résultats suivants</button>}</div>
    {error && <p className="geo-field-error">{error}</p>}
  </div>;
}

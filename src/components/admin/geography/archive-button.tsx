"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, RotateCcw, X } from "lucide-react";
import { getCsrfToken } from "@/lib/auth/browser";
import { AdminNotice, AdminSpinner } from "../ui";
import type { DestinationKind } from "@/lib/geography/schema";

export function ArchiveDestinationButton({ kind, id, name, revision, archived, childrenCount }: { kind: DestinationKind; id: string; name: string; revision: number; archived: boolean; childrenCount: number }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function execute() {
    if (pending) return; setPending(true); setError("");
    try {
      const csrf = await getCsrfToken();
      const response = await fetch(`/api/admin/geography/${kind}/${id}`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify({ operation: archived ? "restore" : "archive", expectedRevision: revision }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      dialog.current?.close(); router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "L’opération a échoué."); }
    finally { setPending(false); }
  }
  return <><button className="admin-button admin-button-quiet geo-archive-button" type="button" onClick={() => dialog.current?.showModal()} aria-label={`${archived ? "Restaurer" : "Archiver"} ${name}`}>{archived ? <RotateCcw size={15} aria-hidden="true" /> : <Archive size={15} aria-hidden="true" />}<span>{archived ? "Restaurer" : "Archiver"}</span></button>
    <dialog className="geo-confirm-dialog" ref={dialog} aria-label={`${archived ? "Restaurer" : "Archiver"} ${name}`} onCancel={(event) => { if (pending) event.preventDefault(); }}><div className="geo-confirm-heading"><h2>{archived ? "Retrouver cette destination" : "Mettre ce carnet de côté"}</h2><button type="button" className="admin-button admin-button-quiet" aria-label="Fermer" disabled={pending} onClick={() => dialog.current?.close()}><X size={18} /></button></div><p>{archived ? `${name} sera restauré en brouillon. Vous pourrez le relire avant de le publier.` : `${name} sera dépublié et conservé dans les archives. Vous pourrez le restaurer à tout moment.`}</p>{!archived && childrenCount > 0 && <p className="geo-publication-note">Cette destination possède {childrenCount} destination{childrenCount > 1 ? "s" : ""} enfant{childrenCount > 1 ? "s" : ""}. Leur accès public sera masqué ; leurs données et contenus seront conservés.</p>}{!archived && <p className="geo-field-hint">Les contenus associés restent enregistrés. Aucune suppression définitive n’est effectuée.</p>}{error && <AdminNotice>{error}</AdminNotice>}<div className="geo-confirm-actions"><button className="admin-button admin-button-quiet" type="button" disabled={pending} onClick={() => dialog.current?.close()}>Annuler</button><button className="admin-button admin-button-primary" type="button" disabled={pending} onClick={execute}>{pending ? <AdminSpinner label="En cours…" /> : archived ? "Restaurer en brouillon" : "Archiver la destination"}</button></div></dialog></>;
}

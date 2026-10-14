"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getCsrfToken } from "@/lib/auth/browser";
import { AdminNotice } from "../ui";

export function ArchiveContentButton({ id, title, revision, archived }: { id: string; title: string; revision: number; archived: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null); const inFlight = useRef(false); const [pending, setPending] = useState(false); const [error, setError] = useState(""); const router = useRouter();
  async function execute() {
    if (inFlight.current) return; inFlight.current = true; setPending(true); setError("");
    try { const csrf = await getCsrfToken(); const response = await fetch(`/api/admin/contents/${id}`, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify({ operation: archived ? "restore" : "archive", expectedRevision: revision }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error); dialog.current?.close(); router.refresh(); }
    catch (error) { setError(error instanceof Error ? error.message : "Opération impossible."); } finally { inFlight.current = false; setPending(false); }
  }
  return <><button type="button" className="admin-button admin-button-quiet" onClick={() => dialog.current?.showModal()}>{archived ? "Restaurer" : "Archiver"}</button><dialog className="geo-confirm-dialog" ref={dialog} aria-labelledby={`archive-${id}`} onCancel={(event) => { if (pending) event.preventDefault(); }}><h2 id={`archive-${id}`}>{archived ? "Retrouver cette découverte" : "Mettre cette découverte de côté"}</h2><p className="geo-publication-note">{archived ? `${title} sera restauré en brouillon.` : `${title} sera dépublié. Ses données et ses relations seront conservées, et vous pourrez le restaurer.`}</p>{error && <AdminNotice>{error}</AdminNotice>}<div className="geo-confirm-actions"><button className="admin-button admin-button-quiet" type="button" disabled={pending} onClick={() => dialog.current?.close()}>Annuler</button><button className="admin-button admin-button-primary" type="button" disabled={pending} onClick={execute}>{pending ? "En cours…" : archived ? "Restaurer en brouillon" : "Archiver la fiche"}</button></div></dialog></>;
}

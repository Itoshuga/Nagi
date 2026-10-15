"use client";

import Image from "next/image";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ChangeEvent } from "react";
import { Upload } from "lucide-react";
import type { Photograph } from "@/types/content";
import type { PhotoScope, StoragePhoto } from "@/lib/photos/schema";
import { protectedPhoto } from "@/lib/photos/urls";

export interface CoverUploadHandle {
  upload: (scope: PhotoScope, csrf: string, title: string) => Promise<StoragePhoto | undefined>;
}
interface Props { initial: Photograph | null; disabled: boolean; maxBytes: number; onSelectionChange?: (selected: boolean) => void }
interface UploadTicket { id: string; transport: "emulator" | "storage"; url: string; fields: Record<string, string> }

async function jsonRequest(url: string, csrf: string, signal: AbortSignal, body?: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: body === undefined ? undefined : JSON.stringify(body), signal });
  const result = await response.json().catch(() => ({ error: "L’envoi de la photo a échoué. Réessayez." }));
  if (!response.ok) throw new Error(result.error || "L’envoi de la photo a échoué. Réessayez.");
  return result;
}
function sendFile(ticket: UploadTicket, file: File, csrf: string, signal: AbortSignal, progress: (value: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest(); const abort = () => xhr.abort();
    xhr.open(ticket.transport === "emulator" ? "PUT" : "POST", ticket.url); xhr.timeout = 120_000;
    signal.addEventListener("abort", abort, { once: true });
    xhr.onloadend = () => signal.removeEventListener("abort", abort);
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) progress(Math.round(event.loaded / event.total * 90)); };
    xhr.onerror = () => reject(new Error("L’envoi a été interrompu. Vérifiez votre connexion et réessayez."));
    xhr.ontimeout = () => reject(new Error("L’envoi a pris trop de temps. Réessayez."));
    xhr.onabort = () => reject(new Error("Envoi interrompu."));
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("La photo n’a pas pu être envoyée. Vérifiez la configuration Storage puis réessayez."));
    if (ticket.transport === "emulator") { xhr.setRequestHeader("X-CSRF-Token", csrf); xhr.setRequestHeader("Content-Type", file.type); xhr.send(file); }
    else { const body = new FormData(); for (const [key, value] of Object.entries(ticket.fields)) body.append(key, value); body.append("file", file); xhr.send(body); }
  });
}

// La sélection reste locale. Seul le submit du formulaire appelle upload().
export const CoverUpload = forwardRef<CoverUploadHandle, Props>(function CoverUpload({ initial, disabled, maxBytes, onSelectionChange }, ref) {
  const [file, setFile] = useState<File | null>(null); const [preview, setPreview] = useState("");
  const [error, setError] = useState(""); const [progress, setProgress] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null); const abort = useRef<AbortController | null>(null);
  const uploaded = useRef<StoragePhoto | undefined>(undefined);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => () => abort.current?.abort(), []);
  useImperativeHandle(ref, () => ({
    async upload(scope, csrf, title) {
      if (!file) return undefined;
      if (uploaded.current) return { ...uploaded.current, alt: title.trim().slice(0, 400) || "Photographie de couverture" };
      const controller = new AbortController(); abort.current = controller; setProgress(0); setError("");
      try {
        const ticket: UploadTicket = await jsonRequest("/api/admin/photos", csrf, controller.signal, { scope, mime: file.type, bytes: file.size });
        await sendFile(ticket, file, csrf, controller.signal, setProgress); setProgress(95);
        const result = await jsonRequest(`/api/admin/photos/${ticket.id}/finalize`, csrf, controller.signal);
        const photo: StoragePhoto = { ...result.photo, alt: title.trim().slice(0, 400) || "Photographie de couverture" };
        uploaded.current = photo;
        return photo;
      } catch (failure) {
        const message = failure instanceof TypeError ? "L’envoi a été interrompu. Vérifiez votre connexion et réessayez." : failure instanceof Error ? failure.message : "L’envoi de la photo a échoué. Réessayez.";
        setError(message); throw new Error(message);
      } finally { setProgress(null); }
    },
  }), [file]);
  function select(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0]; event.target.value = ""; if (!next) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(next.type)) { setError("Choisissez une image JPEG, PNG ou WebP."); return; }
    if (!next.size || next.size > maxBytes) { setError(`La photo doit peser au maximum ${Math.round(maxBytes / 1_000_000)} Mo.`); return; }
    setError(""); setFile(next); setPreview(URL.createObjectURL(next)); uploaded.current = undefined; onSelectionChange?.(true);
  }
  const photograph = preview ? { src: preview, alt: "Aperçu de la nouvelle couverture", position: "50% 50%" } : initial;
  return <fieldset className="geo-fieldset cover-upload" disabled={disabled}><legend>Photo de couverture</legend>
    {photograph && <div className="cover-upload-preview"><Image src={photograph.src} alt={photograph.alt} fill unoptimized={Boolean(preview) || protectedPhoto(photograph.src)} sizes="(max-width: 900px) 90vw, 650px" style={{ objectPosition: photograph.position }} /></div>}
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={select} aria-label="Choisir une photo de couverture" />
    <button type="button" className="admin-button admin-button-quiet" onClick={() => input.current?.click()} disabled={disabled}><Upload size={16} aria-hidden="true" />Upload une photo</button>
    <p className="geo-field-hint">JPEG, PNG ou WebP · {Math.round(maxBytes / 1_000_000)} Mo maximum.</p>
    {file && progress === null && !disabled && <p className="geo-field-hint">La nouvelle photo sera envoyée à l’enregistrement.</p>}
    {progress !== null && <div className="cover-upload-progress" role="status"><span>Envoi de la photo… {progress} %</span><progress max={100} value={progress} aria-label="Envoi de la photo" /></div>}
    {error && <p className="geo-field-error" role="alert">{error}</p>}
  </fieldset>;
});

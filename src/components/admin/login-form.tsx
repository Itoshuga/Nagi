"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { getCsrfToken } from "@/lib/auth/browser";
import { AdminNotice, AdminSpinner } from "./ui";

function loginError(error: unknown) {
  const code = (error as { code?: string }).code;
  if (["auth/invalid-credential", "auth/user-not-found", "auth/wrong-password", "auth/invalid-email", "auth/user-disabled"].includes(code ?? "")) return "L’email ou le mot de passe est incorrect, ou ce compte est indisponible.";
  if (code === "auth/too-many-requests") return "Trop de tentatives. Patientez quelques minutes avant de réessayer.";
  if (code === "auth/network-request-failed" || error instanceof TypeError) return "Connexion au service impossible. Vérifiez votre connexion et réessayez.";
  if (code) return "La connexion est indisponible. Veuillez contacter la personne responsable de Nagi.";
  return error instanceof Error ? error.message : "La connexion a échoué. Veuillez réessayer.";
}

export function LoginForm({ available }: { available: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !available) return;
    const values = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    let cleanup: (() => Promise<void>) | undefined;
    try {
      const csrfToken = await getCsrfToken();
      const [{ getFirebaseClient }, { signInWithEmailAndPassword, signOut, setPersistence, inMemoryPersistence }] = await Promise.all([
        import("@/lib/firebase/client"), import("firebase/auth"),
      ]);
      const { auth } = getFirebaseClient();
      cleanup = () => signOut(auth);
      await setPersistence(auth, inMemoryPersistence);
      const credential = await signInWithEmailAndPassword(auth, String(values.get("email")).trim(), String(values.get("password")));
      const idToken = await credential.user.getIdToken(true);
      const response = await fetch("/api/admin/session", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ idToken }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "La connexion a échoué.");
      await cleanup();
      // Recharger le document renouvelle aussi le cache de navigation après changement de session.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/admin");
    } catch (failure) {
      setError(loginError(failure));
      setPending(false);
    } finally {
      await cleanup?.().catch(() => undefined);
    }
  }

  return (
    <form className="admin-login-form" onSubmit={handleSubmit} aria-busy={pending}>
      {error && <AdminNotice id="login-error">{error}</AdminNotice>}
      <div className="admin-field"><label htmlFor="email">Adresse email</label><input id="email" name="email" type="email" autoComplete="username" required maxLength={254} placeholder="vous@exemple.fr" disabled={pending || !available} aria-describedby={error ? "login-error" : undefined} /></div>
      <div className="admin-field"><label htmlFor="password">Mot de passe</label><div className="admin-password"><input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required maxLength={4096} disabled={pending || !available} aria-describedby={error ? "login-error" : undefined} /><button type="button" aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)} disabled={pending || !available}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>
      <button className="admin-button admin-button-primary" type="submit" disabled={pending || !available}>{pending ? <AdminSpinner label="Connexion en cours…" /> : <>Se connecter <ArrowRight size={18} aria-hidden="true" /></>}</button>
      <p className="admin-login-note"><LockKeyhole size={14} aria-hidden="true" />Accès réservé à l’équipe d’administration.</p>
    </form>
  );
}

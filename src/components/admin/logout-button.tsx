"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { getCsrfToken } from "@/lib/auth/browser";
import { AdminNotice, AdminSpinner } from "./ui";

export function LogoutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setPending(true);
    setError("");
    try {
      const csrfToken = await getCsrfToken();
      const response = await fetch("/api/admin/session", { method: "DELETE", credentials: "same-origin", headers: { "X-CSRF-Token": csrfToken } });
      if (!response.ok) throw new Error();
      // Purger le cache React des pages protégées lors de la fermeture de session.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/admin/login?reason=signed-out");
    } catch { setError("Déconnexion impossible. Veuillez réessayer."); setPending(false); }
  }
  return <div className="admin-logout"><button className="admin-button admin-button-quiet" type="button" onClick={logout} disabled={pending}>{pending ? <AdminSpinner label="Déconnexion…" /> : <><LogOut size={16} aria-hidden="true" /><span>Déconnexion</span></>}</button>{error && <AdminNotice>{error}</AdminNotice>}</div>;
}

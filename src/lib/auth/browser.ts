import "client-only";

export async function getCsrfToken(): Promise<string> {
  const response = await fetch("/api/admin/csrf", { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error("Impossible de préparer la demande. Veuillez réessayer.");
  const body = await response.json();
  return body.csrfToken;
}

import "server-only";

export class PublicDataUnavailable extends Error {
  constructor() { super("Le carnet est momentanément indisponible. Réessayez dans un instant."); }
}
// Ne journaliser ni les messages du SDK (qui peuvent contenir des URL), ni les
// documents, ni la configuration. Une opération et un code suffisent au diagnostic.
export async function publicRead<T>(operation: string, read: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([read(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject({ code: "deadline-exceeded" }), 8000); })]);
  } catch (error) {
    if (!(error instanceof PublicDataUnavailable)) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "invalid-data-or-configuration";
      console.error("[nagi:public]", operation, /^[a-zA-Z0-9_/-]{1,60}$/.test(code) ? code : "unknown");
    }
    throw new PublicDataUnavailable();
  } finally { clearTimeout(timer); }
}

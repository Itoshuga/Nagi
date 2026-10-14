import { loadEnvConfig } from "@next/env";

async function main() {
  const [uid, action, ...extra] = process.argv.slice(2);
  if (!uid || uid.length > 128 || !["grant", "revoke", "revoke-sessions"].includes(action) || extra.length) {
    throw new Error("Usage : npm run admin:role -- <UID existant> <grant|revoke|revoke-sessions>");
  }
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
  const { getAdminAuth } = await import("../src/lib/firebase/admin");
  const auth = getAdminAuth();
  const user = await auth.getUser(uid);
  if (action === "grant" && user.disabled) throw new Error("Ce compte est désactivé.");
  if (action !== "revoke-sessions") {
    const claims = { ...user.customClaims };
    if (action === "grant") claims.admin = true;
    else delete claims.admin;
    await auth.setCustomUserClaims(uid, claims);
  }
  // Invalider les anciennes sessions après tout changement de rôle.
  await auth.revokeRefreshTokens(uid);
  console.info(`Action « ${action} » effectuée pour l’UID ${uid} dans ${process.env.FIREBASE_ADMIN_PROJECT_ID}. Une nouvelle connexion est nécessaire.`);
}

main().catch((error: unknown) => {
  // Éviter d’afficher un objet SDK pouvant contenir des détails de requête.
  const code = (error as { code?: string }).code;
  console.error(code ? `Échec de l’opération Firebase (${code}).` : error instanceof Error ? error.message : "Échec de l’opération.");
  process.exitCode = 1;
});

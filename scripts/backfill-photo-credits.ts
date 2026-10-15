import { loadEnvConfig } from "@next/env";
async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !/^(--dry-run|--apply|--project=[a-z0-9-]+|--confirm-project=[a-z0-9-]+)$/.test(arg)) || new Set(args).size !== args.length) throw new Error("Arguments invalides. Voir docs/PUBLIC_DATA.md.");
  const projects = args.filter((arg) => arg.startsWith("--project=")); const confirmations = args.filter((arg) => arg.startsWith("--confirm-project="));
  if (projects.length !== 1 || confirmations.length > 1) throw new Error("Indiquez exactement un --project=IDENTIFIANT_FIREBASE.");
  const project = projects[0].slice(10); const apply = args.includes("--apply");
  if (apply && (args.includes("--dry-run") || confirmations[0] !== `--confirm-project=${project}`)) throw new Error("L’écriture exige --apply et --confirm-project=IDENTIFIANT_FIREBASE, sans --dry-run.");
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
  if (project !== process.env.FIREBASE_ADMIN_PROJECT_ID || project !== process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) throw new Error("Le projet demandé ne correspond pas à la configuration. Aucune opération effectuée.");
  const { getAdminFirestore } = await import("../src/lib/firebase/admin");
  const { backfillPhotoCredits } = await import("./migrations/photo-credits");
  const db = getAdminFirestore();
  try {
    const plan = await backfillPhotoCredits(db, apply);
    console.info(`${apply ? "CRÉDITS" : "SIMULATION SANS ÉCRITURE"} — projet ${project}`);
    for (const item of plan.filter((item) => item.action !== "keep")) console.info(`${item.path} · ${item.action}`);
    console.info(`${plan.filter((item) => item.action === "add-credit").length} attribution(s) ${apply ? "ajoutée(s)" : "à ajouter"}. Aucun contenu ni crédit existant remplacé.`);
  } finally { await db.terminate(); }
}
main().catch((error: unknown) => { const code = (error as { code?: string }).code; console.error(code ? `Migration impossible (code ${code}).` : error instanceof Error ? error.message : "Migration impossible."); process.exitCode = 1; });

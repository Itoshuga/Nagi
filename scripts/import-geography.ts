import { loadEnvConfig } from "@next/env";

async function main() {
  const args = process.argv.slice(2);
  const allowed = /^(--dry-run|--apply|--project=[a-z0-9-]+|--confirm-project=[a-z0-9-]+)$/;
  if (args.some((arg) => !allowed.test(arg)) || args.some((arg, index) => args.indexOf(arg) !== index)) throw new Error("Arguments invalides. Voir docs/GEOGRAPHY.md.");
  const projectArgs = args.filter((arg) => arg.startsWith("--project="));
  const confirmationArgs = args.filter((arg) => arg.startsWith("--confirm-project="));
  if (projectArgs.length !== 1 || confirmationArgs.length > 1) throw new Error("Indiquez explicitement --project=IDENTIFIANT_FIREBASE.");
  const project = projectArgs[0].slice("--project=".length);
  const apply = args.includes("--apply");
  if (args.includes("--dry-run") && apply) throw new Error("Choisissez soit --dry-run, soit --apply.");
  if (apply && confirmationArgs[0] !== `--confirm-project=${project}`) throw new Error("L’écriture exige --apply et --confirm-project=IDENTIFIANT_FIREBASE.");
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
  if (project !== process.env.FIREBASE_ADMIN_PROJECT_ID || project !== process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) throw new Error("Le projet demandé ne correspond pas à la configuration Firebase. Aucune opération effectuée.");
  const { getAdminFirestore } = await import("../src/lib/firebase/admin");
  const { importDemonstrationGeography } = await import("../src/lib/geography/import");
  const plan = await importDemonstrationGeography(getAdminFirestore(), apply);
  console.info(`${apply ? "IMPORT" : "SIMULATION SANS ÉCRITURE"} — projet ${project}`);
  for (const item of plan) console.info(`${item.action === "create" ? "Créer" : "Conserver"} ${item.collection}/${item.id} · ${item.name} · réservation : ${item.reservation === "create" ? "créer" : "conserver"}`);
  console.info(`${plan.filter((item) => item.action === "create").length} destination(s) ${apply ? "créée(s)" : "à créer"}. Les documents existants sont conservés sans modification.`);
  console.info("La source publique n’a pas été changée. Validez le catalogue, puis activez NAGI_GEOGRAPHY_SOURCE=firestore.");
}
main().catch((error: unknown) => {
  const code = (error as { code?: string }).code;
  console.error(code ? `Import impossible (code ${code}). Vérifiez le projet et sa configuration.` : error instanceof Error ? error.message : "Import impossible.");
  process.exitCode = 1;
});

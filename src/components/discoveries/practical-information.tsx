import type { Discovery, Reservation } from "@/types/discoveries";

const reservations: Record<Reservation, string> = { required: "Nécessaire", recommended: "Conseillée", "not-required": "Non nécessaire" };

export function PracticalInformation({ item }: { item: Discovery }) {
  const facts: [string, string | undefined][] = [];

  if (item.universe === "gastronomie") {
    if (item.ingredients.length) facts.push(["Ingrédients", item.ingredients.join(" · ")]);
  } else if (item.universe === "tourisme") {
    facts.push(
      ["Adresse", item.address],
      ["Durée", item.visitDuration],
      ["Entrée", item.admission ? `${{ free: "Gratuite", paid: "Payante", mixed: "Selon les espaces" }[item.admission.type]}${item.admission.detail ? ` · ${item.admission.detail}` : ""}` : undefined],
      ["Horaires", item.openingHours],
      ["Accès", item.access],
    );
  } else if (item.universe === "adresses") {
    facts.push(
      ["Adresse", item.postalAddress],
      ["Budget", item.budget],
      ["Horaires", item.openingHours],
      ["Réservation", item.reservation ? reservations[item.reservation] : undefined],
    );
  } else {
    facts.push(
      ["Format", item.format === "editorial-idea" ? "Idée d’expérience · sans réservation proposée" : "Expérience proposée"],
      ["Durée", item.duration],
      ["Budget", item.budget],
      ["Réservation", item.reservation ? reservations[item.reservation] : undefined],
    );
  }

  // La fiche d’un écran privilégie trois repères ; les contenus détaillés
  // restent dans le catalogue et le site source demeure accessible.
  const essentials = facts.filter(([, value]) => Boolean(value)).slice(0, 3);
  if (!essentials.length) return null;
  return (
    <dl className="discovery-sheet-facts" aria-label="Les informations essentielles">
      {essentials.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
  );
}

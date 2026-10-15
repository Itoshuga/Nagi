import { coverPhotograph } from "../photos/schema";
import type { PublicGeography } from "../../types/destinations";
import type { Discovery, GeographicReference } from "../../types/discoveries";
import { legacyPhotograph } from "../photos/legacy";
import { resolveGeography } from "../discovery-geography";
import { contentKey, type ContentRelation, type ManagedContent } from "./schema";

export function visibleContent(item: ManagedContent, geography: PublicGeography) {
  return item.status === "published" && item.visibility === "public" && !item.isArchived && item.destinations.some((reference) => resolveGeography(reference, geography));
}
export function toPublicContent(item: ManagedContent, geography: PublicGeography, relations: ContentRelation[] = [], preview = false): Discovery {
  const destinations = item.destinations.filter((reference) => resolveGeography(reference, geography));
  const sections: { title: string; text: string }[] = [];
  const facts: { label: string; value: string }[] = [];
  const section = (title: string, text: string) => { if (text) sections.push({ title, text }); };
  const fact = (label: string, value: string) => { if (value) facts.push({ label, value }); };
  const photograph = legacyPhotograph(item.coverImage, item.coverPresentation?.alt ?? item.title, item.coverPresentation?.position, item.coverCredit);
  const base = { id: item.id, universe: item.type, slug: item.slug, title: item.title, summary: item.summary, description: item.description.split(/\n\s*\n/).filter(Boolean), photograph: coverPhotograph(item, photograph ? { ...photograph, ...item.coverPresentation } : null) ?? undefined, photographCaption: item.coverPhoto ? "" : item.photographCaption,
    tags: item.tags, status: preview ? "published" as const : item.status, createdAt: item.createdAt, updatedAt: item.updatedAt, verifiedAt: item.verifiedAt || undefined, sources: item.sources, sections, extraFacts: facts };
  const location = (destinations[0] ?? item.destinations[0] ?? { kind: "city", id: "preview-without-location" }) as Exclude<GeographicReference, { kind: "country" }>;
  const linked = relations.filter((edge) => edge.memberKeys.includes(contentKey(item)));
  switch (item.type) {
    case "tourisme": {
      const d = item.details; section("Histoire du lieu", d.history); section("Les particularités", d.features); section("Conseils de visite", d.tips);
      if (d.coordinates) fact("Coordonnées", `${d.coordinates.latitude}, ${d.coordinates.longitude}`);
      return { ...base, universe: item.type, location, placeType: d.category, address: d.address, coordinates: d.coordinates ?? undefined, visitDuration: d.visitDuration, admission: d.admission ? { type: d.admission, detail: d.price } : undefined, openingHours: d.openingHours, officialUrl: d.officialUrl, access: d.access };
    }
    case "activites": {
      const d = item.details; section("L’expérience", d.experience); section("Conditions de participation", d.conditions); section("Pour qui", d.audience.join(" · ")); section("À savoir", d.additionalInformation);
      const venues = linked.filter((edge) => edge.kind === "hosts").map((edge) => ({ universe: edge.target.type as "tourisme" | "adresses", id: edge.target.id }));
      const venue = venues.find((value) => value.universe === "tourisme") ?? venues[0];
      return { ...base, universe: item.type, location, activityType: d.category, experience: d.experience, format: d.format, duration: d.duration, budget: d.budget, reservation: d.reservation || undefined, bookingUrl: d.format === "offered-experience" ? d.bookingUrl : undefined, audience: d.audience, venue, organizer: venues.find((value) => value.id !== venue?.id), additionalInformation: d.additionalInformation };
    }
    case "gastronomie": {
      const d = item.details; section("Origine et histoire", d.history); section("Préparation traditionnelle", d.preparation); section("Variantes", d.variants.join("\n")); section("À travers la culture", d.culturalNotes); fact("Translittération", d.transliteration);
      return { ...base, universe: item.type, foodType: d.category, originalName: d.originalName, origins: d.origins, history: d.history.split(/\n\s*\n/).filter(Boolean), ingredients: d.ingredients, variants: d.variants, destinations };
    }
    case "adresses": {
      const d = item.details; section("Conseils pour votre visite", d.tips); fact("Fermeture", d.closedDays); fact("Attente indicative", d.waitingTime); fact("Spécialité principale", d.mainSpecialty); if (d.coordinates) fact("Coordonnées", `${d.coordinates.latitude}, ${d.coordinates.longitude}`);
      return { ...base, universe: item.type, location, establishmentType: d.category, postalAddress: d.postalAddress, coordinates: d.coordinates ?? undefined, website: d.website, openingHours: d.openingHours, budget: d.budget, waitingTime: d.waitingTime, reservation: d.reservation || undefined, bookingUrl: d.bookingUrl, specialtyIds: linked.filter((edge) => edge.kind === "serves").map((edge) => edge.target.id) };
    }
  }
}

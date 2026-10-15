import { discoveries } from "../../data/discoveries";
import { contentInputSchema, relationBetween, type ContentInput, type ContentRelation } from "./schema";
import type { Discovery } from "../../types/discoveries";

export function demonstrationContentInput(item: Discovery): ContentInput {
  let details;
  switch (item.universe) {
    case "tourisme": details = { category: item.placeType, address: item.address, coordinates: item.coordinates, access: item.access, visitDuration: item.visitDuration, admission: item.admission?.type, price: item.admission?.detail, openingHours: item.openingHours, officialUrl: item.officialUrl }; break;
    case "activites": details = { category: item.activityType, experience: item.experience, format: item.format, duration: item.duration, budget: item.budget, reservation: item.reservation, bookingUrl: item.bookingUrl, audience: item.audience, additionalInformation: item.additionalInformation }; break;
    case "gastronomie": details = { category: item.foodType, originalName: item.originalName, origins: item.origins, history: item.history.join("\n\n"), ingredients: item.ingredients, variants: item.variants }; break;
    case "adresses": details = { category: item.establishmentType, postalAddress: item.postalAddress, coordinates: item.coordinates, website: item.website, openingHours: item.openingHours, budget: item.budget, waitingTime: item.waitingTime, reservation: item.reservation, bookingUrl: item.bookingUrl }; break;
  }
  return contentInputSchema.parse({ type: item.universe, title: item.title, slug: item.slug, summary: item.summary, description: item.description.join("\n\n"), coverImage: item.photograph?.src ?? "", coverPresentation: item.photograph ? { alt: item.photograph.alt, position: item.photograph.position } : null, photographCaption: item.photographCaption, tags: item.tags, status: item.status, visibility: "public", destinations: item.universe === "gastronomie" ? item.destinations : [item.location], sources: item.sources, verifiedAt: item.verifiedAt, details });
}
export function demonstrationContents() {
  return discoveries.map((item) => ({ original: item, input: demonstrationContentInput(item) }));
}
export function demonstrationRelations(): ContentRelation[] {
  const edges: ContentRelation[] = [];
  for (const item of discoveries) {
    if (item.universe === "adresses") for (const id of item.specialtyIds) edges.push(relationBetween({ id: item.id, type: item.universe }, { id, type: "gastronomie" })!);
    if (item.universe === "activites" && item.venue) edges.push(relationBetween({ id: item.id, type: item.universe }, { id: item.venue.id, type: item.venue.universe })!);
  }
  return [...new Map(edges.map((edge) => [edge.id, edge])).values()];
}

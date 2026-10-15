import { permanentRedirect } from "next/navigation";
import { requireCity } from "@/lib/destination-pages";
import { requireUniverse } from "@/lib/discovery-pages";
import { explorerPath } from "@/lib/discovery-geography";


export default async function Page({ params }: PageProps<"/destinations/[country]/[city]/explorer/[universe]">) {
  const values = await params;
  const { city, geography } = await requireCity(values);
  permanentRedirect(explorerPath({ kind: "city", id: city.id }, requireUniverse(values.universe), geography));
}

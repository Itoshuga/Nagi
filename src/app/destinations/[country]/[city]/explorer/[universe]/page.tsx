import { permanentRedirect } from "next/navigation";
import { getCityParams } from "@/lib/destinations";
import { requireCity } from "@/lib/destination-pages";
import { requireUniverse } from "@/lib/discovery-pages";
import { explorerPath } from "@/lib/discovery-geography";
import { universeSlugs } from "@/types/discoveries";

export const dynamicParams = false;
export function generateStaticParams() { return getCityParams().flatMap((params) => universeSlugs.map((universe) => ({ ...params, universe }))); }

export default async function Page({ params }: PageProps<"/destinations/[country]/[city]/explorer/[universe]">) {
  const values = await params;
  const { city } = requireCity(values);
  permanentRedirect(explorerPath({ kind: "city", id: city.id }, requireUniverse(values.universe)));
}

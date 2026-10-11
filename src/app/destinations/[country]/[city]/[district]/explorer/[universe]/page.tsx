import { permanentRedirect } from "next/navigation";
import { getDistrictParams } from "@/lib/destinations";
import { requireDistrict } from "@/lib/destination-pages";
import { requireUniverse } from "@/lib/discovery-pages";
import { explorerPath } from "@/lib/discovery-geography";
import { universeSlugs } from "@/types/discoveries";

export const dynamicParams = false;
export function generateStaticParams() { return getDistrictParams().flatMap((params) => universeSlugs.map((universe) => ({ ...params, universe }))); }

export default async function Page({ params }: PageProps<"/destinations/[country]/[city]/[district]/explorer/[universe]">) {
  const values = await params;
  const { district } = requireDistrict(values);
  permanentRedirect(explorerPath({ kind: "district", id: district.id }, requireUniverse(values.universe)));
}

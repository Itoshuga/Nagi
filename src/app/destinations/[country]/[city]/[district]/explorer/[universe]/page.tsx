import { getPublicGeography } from "@/lib/geography/public";
import { permanentRedirect } from "next/navigation";
import { requireDistrict } from "@/lib/destination-pages";
import { requireUniverse } from "@/lib/discovery-pages";
import { explorerPath } from "@/lib/discovery-geography";


export default async function Page({ params }: PageProps<"/destinations/[country]/[city]/[district]/explorer/[universe]">) {
  const values = await params;
  const { district } = await requireDistrict(values);
  permanentRedirect(explorerPath({ kind: "district", id: district.id }, requireUniverse(values.universe), await getPublicGeography()));
}

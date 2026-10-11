import { DiscoveryArticle } from "@/components/discoveries/discovery-article";
import { getPublishedDiscoveries, discoveryPath } from "@/lib/discoveries";
import { requireDiscovery } from "@/lib/discovery-pages";
import { destinationMetadata } from "@/lib/destination-metadata";

export const dynamicParams = false;
export function generateStaticParams() { return getPublishedDiscoveries().map(({ universe, slug }) => ({ universe, slug })); }

export async function generateMetadata({ params }: PageProps<"/decouvertes/[universe]/[slug]">) {
  const { universe, slug } = await params;
  const item = requireDiscovery(universe, slug);
  return destinationMetadata(item.title, item.summary, discoveryPath(item));
}

export default async function Page({ params }: PageProps<"/decouvertes/[universe]/[slug]">) {
  const { universe, slug } = await params;
  return <DiscoveryArticle item={requireDiscovery(universe, slug)} />;
}

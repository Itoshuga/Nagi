import { discoveryPath } from "@/lib/discoveries";
import { DiscoveryArticle } from "@/components/discoveries/discovery-article";
import { requireDiscovery } from "@/lib/discovery-pages";
import { destinationMetadata } from "@/lib/destination-metadata";


export async function generateMetadata({ params }: PageProps<"/decouvertes/[universe]/[slug]">) {
  const { universe, slug } = await params;
  const item = await requireDiscovery(universe, slug);
  return destinationMetadata(item.title, item.summary, discoveryPath(item));
}

export default async function Page({ params }: PageProps<"/decouvertes/[universe]/[slug]">) {
  const { universe, slug } = await params;
  return <DiscoveryArticle item={await requireDiscovery(universe, slug)} />;
}

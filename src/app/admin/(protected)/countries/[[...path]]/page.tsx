import { requireAdmin } from "@/lib/auth/session";
import { GeographyPage } from "@/components/admin/geography/page";

export const metadata = { title: "Gestion des destinations" };
export default async function Page({ params, searchParams }: { params: Promise<{ path?: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const [{ path }, query] = await Promise.all([params, searchParams]);
  return <GeographyPage kind="countries" path={path ?? []} query={query} />;
}

import { AdminSpinner } from "@/components/admin/ui";

export default function AdminLoading() {
  return <div className="admin-loading"><AdminSpinner label="Ouverture de votre espace…" /></div>;
}

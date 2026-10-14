import { ShieldCheck } from "lucide-react";
import { LogoutButton } from "./logout-button";

export function AdminHeader({ email }: { email: string }) {
  return <header className="admin-header"><div className="admin-account"><ShieldCheck size={18} strokeWidth={1.5} aria-hidden="true" /><div><span>Administration</span><p>{email}</p></div></div><LogoutButton /></header>;
}

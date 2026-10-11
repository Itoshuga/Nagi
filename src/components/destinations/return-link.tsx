import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function ReturnLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <div className="place-return section-shell"><Link href={href}><ArrowLeft size={16} strokeWidth={1.2} aria-hidden="true" /><span>{children}</span></Link><span className="eyebrow">À chacun son chemin</span></div>;
}

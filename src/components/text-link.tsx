import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

interface TextLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
}

export function TextLink({ href, children, className = "" }: TextLinkProps) {
  return (
    <Link className={`text-link ${className}`} href={href}>
      <span>{children}</span>
      <ArrowUpRight size={16} strokeWidth={1.25} aria-hidden="true" />
    </Link>
  );
}

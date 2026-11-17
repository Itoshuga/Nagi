import Link from 'next/link';
import Image from 'next/image';
export function Logo({ href = '/' }: { href?: string }) {
  return (
    <Link
      href={href}
      aria-label="Nagi, accueil"
      className="inline-flex w-fit items-center gap-2.5 rounded-sm text-[23px] font-semibold tracking-[-0.06em]"
    >
      <span
        className="relative size-11 shrink-0 overflow-hidden rounded-2xl bg-accent"
        aria-hidden="true"
      >
        <Image src="/nagi-logo.png" alt="" fill sizes="44px" className="object-contain" priority />
      </span>
      <span>
        Nagi<span className="text-primary">.</span>
      </span>
    </Link>
  );
}

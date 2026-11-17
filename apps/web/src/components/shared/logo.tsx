import Link from 'next/link';
import Image from 'next/image';
export function Logo({
  href = '/',
  variant = 'default',
}: {
  href?: string;
  variant?: 'default' | 'app';
}) {
  const app = variant === 'app';
  return (
    <Link
      href={href}
      aria-label="Nagi, accueil"
      className={
        app
          ? 'app-brand'
          : 'inline-flex w-fit items-center gap-2.5 rounded-sm text-[23px] font-semibold tracking-[-0.06em]'
      }
    >
      <span
        className={
          app
            ? 'app-brand-symbol'
            : 'relative size-11 shrink-0 overflow-hidden rounded-2xl bg-accent'
        }
        aria-hidden="true"
      >
        <Image
          src="/nagi-logo.png"
          alt=""
          fill
          sizes={app ? '36px' : '44px'}
          className="object-contain"
          priority
        />
      </span>
      <span className={app ? 'app-brand-wordmark font-extrabold' : undefined}>
        Nagi<span className="text-primary">.</span>
      </span>
    </Link>
  );
}

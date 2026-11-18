'use client';

import Link from 'next/link';
import { useState, type ComponentProps } from 'react';

/** Prefetch the destination when the user points to or focuses a link. */
export function IntentLink({
  href,
  onMouseEnter,
  onFocus,
  ...props
}: Omit<ComponentProps<typeof Link>, 'href'> & { href: string }) {
  const [prefetch, setPrefetch] = useState(false);
  return (
    <Link
      {...props}
      href={href}
      prefetch={prefetch}
      onMouseEnter={(event) => {
        setPrefetch(true);
        onMouseEnter?.(event);
      }}
      onFocus={(event) => {
        setPrefetch(true);
        onFocus?.(event);
      }}
    />
  );
}

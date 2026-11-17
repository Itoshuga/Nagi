import Link from 'next/link';
import { Button } from '@nagi/ui';
export default function NotFound() {
  return (
    <main
      id="main"
      className="hero flex flex-col items-center justify-center gap-5 px-6 text-center"
    >
      <p className="text-xs uppercase tracking-widest text-muted-foreground">
        404 · Un petit détour
      </p>
      <h1 className="font-display text-4xl">Cette page reste à explorer.</h1>
      <Button asChild variant="secondary">
        <Link href="/">Revenir à Nagi</Link>
      </Button>
    </main>
  );
}

'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export function RefreshStatus() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, 20000);
    return () => clearInterval(timer);
  }, [router]);
  return <p className="text-xs text-muted-foreground">Actualisation toutes les 20 secondes.</p>;
}

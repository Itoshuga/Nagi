'use client';
import { useTransition } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button, toast } from '@nagi/ui';
import { enqueueSync } from './actions';
export function SyncButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await enqueueSync();
          if (result.ok) toast.success(result.message);
          else toast.error(result.message);
        })
      }
    >
      <RefreshCw
        className={`size-3.5 ${pending ? 'animate-spin motion-reduce:animate-none' : ''}`}
      />
      {pending ? 'Enregistrement…' : 'Synchroniser les commandes'}
    </Button>
  );
}

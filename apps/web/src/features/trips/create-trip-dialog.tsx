import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Button } from '@nagi/ui';

export function CreateTripLink({ guildId, entry }: { guildId: string; entry?: string }) {
  return (
    <Button asChild>
      <Link href={`/app/${guildId}/trips/new${entry ? `?ajouter=${entry}` : ''}`}>
        <Plus className="size-4" /> Créer un voyage
      </Link>
    </Button>
  );
}

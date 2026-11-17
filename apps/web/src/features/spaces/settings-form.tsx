'use client';
import { useActionState } from 'react';
import { Alert, Button } from '@nagi/ui';
import { saveGuildSettings } from './actions';
export function SettingsForm({
  guildId,
  membersCanCreate,
}: {
  guildId: string;
  membersCanCreate: boolean;
}) {
  const [state, action, pending] = useActionState(saveGuildSettings.bind(null, guildId), {
    error: '',
  });
  return (
    <form action={action} className="space-y-6">
      <label className="flex items-start gap-4">
        <input
          type="checkbox"
          name="members_can_create_trips"
          defaultChecked={membersCanCreate}
          className="mt-1 size-5 shrink-0 accent-primary-ink"
        />
        <span>
          <span className="block text-sm font-bold">Autoriser les membres à créer des voyages</span>
          <span className="mt-2 block text-xs leading-6 text-muted-foreground">
            Lorsque cette option est désactivée, seuls les administrateurs Discord de cet espace
            peuvent créer un voyage. Tous les membres conservent l’accès aux voyages communs.
          </span>
        </span>
      </label>
      {state.error && <Alert>{state.error}</Alert>}
      <Button type="submit" disabled={pending}>
        {pending ? 'Enregistrement…' : 'Enregistrer les paramètres'}
      </Button>
    </form>
  );
}

'use client';
import { useActionState, useState } from 'react';
import { Save } from 'lucide-react';
import { Alert, Button } from '@nagi/ui';
import { saveGuildSettings } from './actions';
export function SettingsForm({
  guildId,
  membersCanCreate,
}: {
  guildId: string;
  membersCanCreate: boolean;
}) {
  const [enabled, setEnabled] = useState(membersCanCreate);
  const [state, action, pending] = useActionState(saveGuildSettings.bind(null, guildId), {
    error: '',
  });
  return (
    <form action={action} className="space-y-6">
      <fieldset disabled={pending} className="min-w-0">
        <label className="flex cursor-pointer items-start gap-4">
          <input
            type="checkbox"
            name="members_can_create_trips"
            role="switch"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="mt-1 size-5 shrink-0 accent-primary-ink"
          />
          <span>
            <span className="block text-sm font-bold">
              Autoriser les membres à créer des voyages
            </span>
            <span className="mt-2 block text-xs leading-6 text-muted-foreground">
              Lorsque cette option est désactivée, seuls les administrateurs Discord de cet espace
              peuvent créer un voyage. Tous les membres conservent l’accès aux voyages communs.
            </span>
          </span>
        </label>
      </fieldset>
      {state.error && <Alert role="alert">{state.error}</Alert>}
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        disabled={pending || enabled === membersCanCreate}
      >
        <Save className="size-4" aria-hidden="true" />
        {pending ? 'Enregistrement…' : 'Enregistrer les paramètres'}
      </Button>
    </form>
  );
}
